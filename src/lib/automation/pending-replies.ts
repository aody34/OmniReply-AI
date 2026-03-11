import supabase from '../db';
import logger from '../utils/logger';
import { detectLanguage } from '../utils/language';
import { captureLeadFromMessage } from '../crm/lead-capture';
import { upsertDailyStat } from '../stats';
import { evaluateTenantFlows } from './flows';
import { getTenantAutomationSettings } from './settings';
import type {
    FlowEvaluationResult,
    LeadSnapshot,
    PendingReplyPayload,
    PendingReplyPlan,
    TenantAutomationSettings,
} from './types';

export type PendingReplyRow = {
    id: string;
    tenantId: string;
    messageLogId?: string | null;
    phone: string;
    status: string;
    sourceType?: string | null;
    scheduledAt: string;
    expiresAt: string;
    attempts?: number | null;
    payload?: PendingReplyPayload | null;
    lastError?: string | null;
    sentAt?: string | null;
    cancelledAt?: string | null;
    flowId?: string | null;
    templateId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
};

const PENDING_REPLY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEUE_DELAY_MS = 2 * 60 * 1000;
const WORKING_HOURS_RETRY_MS = 15 * 60 * 1000;
const RATE_LIMIT_RETRY_MS = 60 * 60 * 1000;

function toIso(date: Date): string {
    return date.toISOString();
}

export function normalizePhoneIdentifier(phone: string): string {
    return phone.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
}

export function toChatJid(phone: string): string {
    return phone.includes('@') ? phone : `${normalizePhoneIdentifier(phone)}@s.whatsapp.net`;
}

function parsePendingReplyPayload(payload: unknown): PendingReplyPayload | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    const candidate = payload as Partial<PendingReplyPayload>;
    if (!candidate.plan || typeof candidate.plan !== 'object') {
        return null;
    }

    return {
        inboundMessage: typeof candidate.inboundMessage === 'string' ? candidate.inboundMessage : '',
        detectedLanguage: candidate.detectedLanguage === 'so' ? 'so' : 'en',
        flowId: typeof candidate.flowId === 'string' ? candidate.flowId : null,
        plan: {
            addTags: Array.isArray(candidate.plan.addTags) ? candidate.plan.addTags.map((tag) => String(tag)) : [],
            ensureLead: Boolean(candidate.plan.ensureLead),
            leadUpdates: candidate.plan.leadUpdates,
            waitMinutes: typeof candidate.plan.waitMinutes === 'number' ? candidate.plan.waitMinutes : 0,
            send: candidate.plan.send,
        },
    };
}

export async function getLeadSnapshot(
    tenantId: string,
    phone: string,
): Promise<LeadSnapshot | null> {
    const normalizedPhone = normalizePhoneIdentifier(phone);
    const { data, error } = await supabase
        .from('Lead')
        .select('id, phone, name, tags, messageCount, humanOverrideUntil')
        .eq('tenantId', tenantId)
        .eq('phone', normalizedPhone)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data || null;
}

async function ensureTenantIsActive(tenantId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('Tenant')
        .select('isActive')
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return Boolean(data?.isActive);
}

export async function applyLeadPlanEffects(
    tenantId: string,
    phone: string,
    plan: PendingReplyPlan,
): Promise<void> {
    const normalizedPhone = normalizePhoneIdentifier(phone);
    const lead = await getLeadSnapshot(tenantId, normalizedPhone);

    if (!lead && !plan.ensureLead && !plan.addTags.length && !plan.leadUpdates?.name && !(plan.leadUpdates?.tags || []).length) {
        return;
    }

    const now = toIso(new Date());
    const tagSet = new Set<string>([
        ...(lead?.tags || []),
        ...plan.addTags,
        ...(plan.leadUpdates?.tags || []),
    ].map((tag) => String(tag).trim()).filter(Boolean));

    if (!lead) {
        await supabase.from('Lead').insert({
            tenantId,
            phone: normalizedPhone,
            name: plan.leadUpdates?.name || null,
            messageCount: 1,
            lastContact: now,
            tags: Array.from(tagSet),
        });
        return;
    }

    const updatePayload: Record<string, unknown> = {
        lastContact: now,
        updatedAt: now,
    };

    if (plan.leadUpdates?.name !== undefined) {
        updatePayload.name = plan.leadUpdates.name;
    }

    if (tagSet.size) {
        updatePayload.tags = Array.from(tagSet);
    }

    await supabase
        .from('Lead')
        .update(updatePayload)
        .eq('id', lead.id)
        .eq('tenantId', tenantId);
}

function resolveBaseDelayMinutes(settings: TenantAutomationSettings): number {
    switch (settings.autoReplyMode) {
        case 'DELAYED':
        case 'HYBRID':
            return settings.replyDelayMinutes;
        case 'OFFLINE_ONLY':
        case 'OFF':
        default:
            return 0;
    }
}

export function computeInitialScheduledAt(
    settings: TenantAutomationSettings,
    plan: PendingReplyPlan,
    now = new Date(),
): Date {
    const delayMinutes = resolveBaseDelayMinutes(settings) + Math.max(0, plan.waitMinutes || 0);
    return new Date(now.getTime() + delayMinutes * 60_000);
}

async function createPendingReplyRecord(input: {
    tenantId: string;
    messageLogId: string;
    phone: string;
    sourceType: string;
    flowId?: string | null;
    templateId?: string | null;
    payload: PendingReplyPayload;
    scheduledAt: Date;
    expiresAt: Date;
}): Promise<PendingReplyRow> {
    const { data, error } = await supabase
        .from('PendingReply')
        .insert({
            tenantId: input.tenantId,
            messageLogId: input.messageLogId,
            phone: normalizePhoneIdentifier(input.phone),
            sourceType: input.sourceType,
            flowId: input.flowId || null,
            templateId: input.templateId || null,
            payload: input.payload,
            scheduledAt: toIso(input.scheduledAt),
            expiresAt: toIso(input.expiresAt),
        })
        .select('*')
        .single();

    if (error) {
        throw error;
    }

    return {
        ...data,
        payload: parsePendingReplyPayload(data.payload),
        status: data.status || 'pending',
    };
}

export async function schedulePendingReplyForIncomingMessage(input: {
    tenantId: string;
    phone: string;
    message: string;
}): Promise<{ messageLogId: string; pendingReply: PendingReplyRow | null; evaluation: FlowEvaluationResult | null }> {
    const tenantId = input.tenantId;
    const phone = normalizePhoneIdentifier(input.phone);
    const now = new Date();

    const { data: messageLog, error: messageLogError } = await supabase
        .from('MessageLog')
        .insert({
            tenantId,
            direction: 'inbound',
            phone,
            message: input.message,
            repliedBy: 'NONE',
        })
        .select('id')
        .single();

    if (messageLogError || !messageLog) {
        throw messageLogError || new Error('Failed to create message log');
    }

    await upsertDailyStat(tenantId, { messagesIn: 1 });
    await captureLeadFromMessage(tenantId, phone, input.message);

    const tenantActive = await ensureTenantIsActive(tenantId);
    if (!tenantActive) {
        logger.warn({ tenantId }, 'Skipping pending reply for inactive tenant');
        return { messageLogId: messageLog.id, pendingReply: null, evaluation: null };
    }

    const settings = await getTenantAutomationSettings(tenantId);
    if (settings.autoReplyMode === 'OFF') {
        return { messageLogId: messageLog.id, pendingReply: null, evaluation: null };
    }

    const lead = await getLeadSnapshot(tenantId, phone);
    const detectedLanguage = detectLanguage(input.message) === 'so' ? 'so' : 'en';
    const evaluation = await evaluateTenantFlows(tenantId, {
        phone,
        inboundMessage: input.message,
        detectedLanguage,
        lead,
        settings,
        now,
    });

    await applyLeadPlanEffects(tenantId, phone, evaluation.plan);

    if (!evaluation.plan.send) {
        return { messageLogId: messageLog.id, pendingReply: null, evaluation };
    }

    const scheduledAt = computeInitialScheduledAt(settings, evaluation.plan, now);
    const expiresAt = new Date(now.getTime() + PENDING_REPLY_MAX_AGE_MS);
    const pendingReply = await createPendingReplyRecord({
        tenantId,
        messageLogId: messageLog.id,
        phone,
        sourceType: evaluation.sourceType,
        flowId: evaluation.flowId || null,
        templateId: evaluation.plan.send.templateId || null,
        payload: {
            inboundMessage: input.message,
            detectedLanguage,
            flowId: evaluation.flowId || null,
            plan: evaluation.plan,
        },
        scheduledAt,
        expiresAt,
    });

    await supabase
        .from('MessageLog')
        .update({ pendingReplyId: pendingReply.id })
        .eq('id', messageLog.id)
        .eq('tenantId', tenantId);

    logger.info({ tenantId, phone, pendingReplyId: pendingReply.id, scheduledAt: pendingReply.scheduledAt }, 'Queued pending reply');
    return { messageLogId: messageLog.id, pendingReply, evaluation };
}

export async function cancelPendingRepliesForPhone(
    tenantId: string,
    phone: string,
    reason = 'cancelled',
): Promise<number> {
    const normalizedPhone = normalizePhoneIdentifier(phone);
    const now = toIso(new Date());
    const { data, error } = await supabase
        .from('PendingReply')
        .update({
            status: 'cancelled',
            cancelledAt: now,
            lastError: reason,
            updatedAt: now,
        })
        .eq('tenantId', tenantId)
        .eq('phone', normalizedPhone)
        .in('status', ['pending', 'processing'])
        .select('id');

    if (error) {
        throw error;
    }

    return data?.length || 0;
}

export async function setLeadHumanOverride(
    tenantId: string,
    phone: string,
    durationMinutes: number,
): Promise<void> {
    const lead = await getLeadSnapshot(tenantId, phone);
    if (!lead?.id) {
        return;
    }

    const now = new Date();
    const overrideUntil = new Date(now.getTime() + Math.max(1, durationMinutes) * 60_000);

    await supabase
        .from('Lead')
        .update({
            lastManualReplyAt: toIso(now),
            humanOverrideUntil: toIso(overrideUntil),
            updatedAt: toIso(now),
        })
        .eq('id', lead.id)
        .eq('tenantId', tenantId);
}

export async function hasActiveHumanOverride(
    tenantId: string,
    phone: string,
    now = new Date(),
): Promise<Date | null> {
    const lead = await getLeadSnapshot(tenantId, phone);
    if (!lead?.humanOverrideUntil) {
        return null;
    }

    const overrideUntil = new Date(lead.humanOverrideUntil);
    if (Number.isNaN(overrideUntil.getTime()) || overrideUntil <= now) {
        return null;
    }

    return overrideUntil;
}

export async function claimDuePendingReplies(limit = 10): Promise<PendingReplyRow[]> {
    const nowIso = toIso(new Date());
    const { data, error } = await supabase
        .from('PendingReply')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduledAt', nowIso)
        .order('scheduledAt', { ascending: true })
        .limit(limit);

    if (error) {
        throw error;
    }

    const claimed: PendingReplyRow[] = [];

    for (const row of data || []) {
        const { data: updated, error: updateError } = await supabase
            .from('PendingReply')
            .update({
                status: 'processing',
                attempts: (row.attempts || 0) + 1,
                updatedAt: nowIso,
            })
            .eq('id', row.id)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();

        if (updateError) {
            throw updateError;
        }

        if (updated) {
            claimed.push({
                ...updated,
                payload: parsePendingReplyPayload(updated.payload),
                status: updated.status || 'processing',
            });
        }
    }

    return claimed;
}

export async function reschedulePendingReply(
    pendingReplyId: string,
    scheduledAt: Date,
    reason: string,
): Promise<void> {
    const now = toIso(new Date());
    await supabase
        .from('PendingReply')
        .update({
            status: 'pending',
            scheduledAt: toIso(scheduledAt),
            lastError: reason,
            updatedAt: now,
        })
        .eq('id', pendingReplyId);
}

export async function markPendingReplyCancelled(
    pendingReplyId: string,
    reason: string,
): Promise<void> {
    const now = toIso(new Date());
    await supabase
        .from('PendingReply')
        .update({
            status: 'cancelled',
            cancelledAt: now,
            lastError: reason,
            updatedAt: now,
        })
        .eq('id', pendingReplyId);
}

export async function markPendingReplyFailed(
    pendingReplyId: string,
    reason: string,
): Promise<void> {
    const now = toIso(new Date());
    await supabase
        .from('PendingReply')
        .update({
            status: 'failed',
            lastError: reason,
            updatedAt: now,
        })
        .eq('id', pendingReplyId);
}

export async function markPendingReplySent(
    pendingReplyId: string,
    sentAt = new Date(),
): Promise<void> {
    await supabase
        .from('PendingReply')
        .update({
            status: 'sent',
            sentAt: toIso(sentAt),
            updatedAt: toIso(sentAt),
        })
        .eq('id', pendingReplyId);
}

export function buildRescheduleDate(now: Date, reason: 'socket' | 'working_hours' | 'rate_limit' | 'retry'): Date {
    switch (reason) {
        case 'working_hours':
            return new Date(now.getTime() + WORKING_HOURS_RETRY_MS);
        case 'rate_limit':
            return new Date(now.getTime() + RATE_LIMIT_RETRY_MS);
        case 'socket':
        case 'retry':
        default:
            return new Date(now.getTime() + REQUEUE_DELAY_MS);
    }
}
