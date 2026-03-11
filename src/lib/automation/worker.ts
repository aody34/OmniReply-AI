import supabase from '../db';
import logger from '../utils/logger';
import { humanMimicry, checkRateLimit } from '../amniga/anti-ban';
import { upsertDailyStat } from '../stats';
import { getActiveSocket } from '../whatsapp/connector';
import { generateStructuredAIReply } from './ai-reply';
import { getOwnerActivityStatus } from './owner-activity';
import {
    applyLeadPlanEffects,
    buildRescheduleDate,
    claimDuePendingReplies,
    getLeadSnapshot,
    hasActiveHumanOverride,
    markPendingReplyCancelled,
    markPendingReplyFailed,
    markPendingReplySent,
    normalizePhoneIdentifier,
    reschedulePendingReply,
    toChatJid,
    type PendingReplyRow,
} from './pending-replies';
import { getTenantAutomationSettings } from './settings';
import { renderTemplate } from './templates';
import { isWithinWorkingHours } from './working-hours';

const DEFAULT_POLL_INTERVAL_MS = parseInt(process.env.PENDING_REPLY_POLL_INTERVAL_MS || '15000', 10);
const MAX_PENDING_REPLY_ATTEMPTS = parseInt(process.env.PENDING_REPLY_MAX_ATTEMPTS || '5', 10);

let workerTimer: NodeJS.Timeout | null = null;
let started = false;
let running = false;
let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;

async function getTemplateContent(tenantId: string, templateId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('Template')
        .select('content')
        .eq('tenantId', tenantId)
        .eq('id', templateId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data?.content || null;
}

async function getTemplateContext(tenantId: string, phone: string): Promise<Record<string, string>> {
    const normalizedPhone = normalizePhoneIdentifier(phone);
    const [{ data: tenant }, lead] = await Promise.all([
        supabase.from('Tenant').select('name').eq('id', tenantId).maybeSingle(),
        getLeadSnapshot(tenantId, normalizedPhone),
    ]);

    return {
        name: lead?.name || '',
        phone: normalizedPhone,
        businessName: tenant?.name || '',
    };
}

function computeOfflineRescheduleAt(input: {
    lastActiveAt: string | null;
    offlineGraceMinutes: number;
    replyDelayMinutes: number;
    hybrid: boolean;
    now: Date;
}): Date {
    if (!input.lastActiveAt) {
        return new Date(input.now.getTime() + 2 * 60_000);
    }

    const lastActiveMs = new Date(input.lastActiveAt).getTime();
    if (Number.isNaN(lastActiveMs)) {
        return new Date(input.now.getTime() + 2 * 60_000);
    }

    const baseDelayMs = input.offlineGraceMinutes * 60_000;
    const hybridDelayMs = input.hybrid ? input.replyDelayMinutes * 60_000 : 0;
    const scheduledMs = lastActiveMs + baseDelayMs + hybridDelayMs;

    return new Date(Math.max(scheduledMs, input.now.getTime() + 2 * 60_000));
}

async function resolveReplyText(pendingReply: PendingReplyRow): Promise<{ text: string; language: string; aiGenerated: boolean; aiTags: string[] }> {
    const payload = pendingReply.payload;
    const send = payload?.plan.send;

    if (!payload || !send) {
        throw new Error('Pending reply payload is missing send instructions');
    }

    if (send.type === 'sendText') {
        return {
            text: send.text || '',
            language: payload.detectedLanguage,
            aiGenerated: false,
            aiTags: [],
        };
    }

    if (send.type === 'sendTemplate') {
        if (!send.templateId) {
            throw new Error('Template send action missing templateId');
        }

        const templateContent = await getTemplateContent(pendingReply.tenantId, send.templateId);
        if (!templateContent) {
            throw new Error('Template not found for pending reply');
        }

        const context = await getTemplateContext(pendingReply.tenantId, pendingReply.phone);
        return {
            text: renderTemplate(templateContent, context),
            language: payload.detectedLanguage,
            aiGenerated: false,
            aiTags: [],
        };
    }

    const structuredReply = await generateStructuredAIReply({
        tenantId: pendingReply.tenantId,
        message: payload.inboundMessage,
        prompt: send.prompt,
    });

    if (structuredReply.shouldCreateLead || structuredReply.tagsToAdd.length) {
        await applyLeadPlanEffects(pendingReply.tenantId, pendingReply.phone, {
            addTags: structuredReply.tagsToAdd,
            ensureLead: structuredReply.shouldCreateLead,
            waitMinutes: 0,
        });
    }

    return {
        text: structuredReply.replyText,
        language: structuredReply.language,
        aiGenerated: true,
        aiTags: structuredReply.tagsToAdd,
    };
}

async function processPendingReply(pendingReply: PendingReplyRow): Promise<void> {
    const now = new Date();
    const settings = await getTenantAutomationSettings(pendingReply.tenantId);

    if (settings.autoReplyMode === 'OFF') {
        await markPendingReplyCancelled(pendingReply.id, 'auto_reply_disabled');
        return;
    }

    if (new Date(pendingReply.expiresAt) <= now) {
        await markPendingReplyCancelled(pendingReply.id, 'expired');
        return;
    }

    if (settings.enableHumanOverride) {
        const overrideUntil = await hasActiveHumanOverride(pendingReply.tenantId, pendingReply.phone, now);
        if (overrideUntil) {
            await reschedulePendingReply(pendingReply.id, overrideUntil, 'human_override_active');
            return;
        }
    }

    if (!isWithinWorkingHours(settings.workingHours, now)) {
        await reschedulePendingReply(pendingReply.id, buildRescheduleDate(now, 'working_hours'), 'outside_working_hours');
        return;
    }

    if (settings.autoReplyMode === 'OFFLINE_ONLY' || settings.autoReplyMode === 'HYBRID') {
        const activity = await getOwnerActivityStatus(pendingReply.tenantId, settings.offlineGraceMinutes);
        if (!activity.offline) {
            await reschedulePendingReply(
                pendingReply.id,
                computeOfflineRescheduleAt({
                    lastActiveAt: activity.lastActiveAt,
                    offlineGraceMinutes: settings.offlineGraceMinutes,
                    replyDelayMinutes: settings.replyDelayMinutes,
                    hybrid: settings.autoReplyMode === 'HYBRID',
                    now,
                }),
                'owner_online',
            );
            return;
        }
    }

    const socket = getActiveSocket(pendingReply.tenantId);
    if (!socket) {
        await reschedulePendingReply(pendingReply.id, buildRescheduleDate(now, 'socket'), 'socket_unavailable');
        return;
    }

    const withinDailyLimit = await checkRateLimit(pendingReply.tenantId);
    if (!withinDailyLimit) {
        await reschedulePendingReply(pendingReply.id, buildRescheduleDate(now, 'rate_limit'), 'rate_limit_reached');
        return;
    }

    const payload = pendingReply.payload;
    if (!payload) {
        await markPendingReplyFailed(pendingReply.id, 'missing_payload');
        return;
    }

    await applyLeadPlanEffects(pendingReply.tenantId, pendingReply.phone, payload.plan);
    const reply = await resolveReplyText(pendingReply);
    const chatJid = toChatJid(pendingReply.phone);
    await humanMimicry(socket, chatJid);
    await socket.sendMessage(chatJid, { text: reply.text });

    const sentAt = new Date();
    if (pendingReply.messageLogId) {
        await supabase
            .from('MessageLog')
            .update({
                repliedBy: 'AI',
                repliedAt: sentAt.toISOString(),
            })
            .eq('id', pendingReply.messageLogId)
            .eq('tenantId', pendingReply.tenantId);
    }

    await supabase.from('MessageLog').insert({
        tenantId: pendingReply.tenantId,
        direction: 'outbound',
        phone: normalizePhoneIdentifier(pendingReply.phone),
        message: reply.text,
        language: reply.language,
        aiModel: reply.aiGenerated ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash') : null,
        repliedBy: 'AI',
        repliedAt: sentAt.toISOString(),
    });

    await upsertDailyStat(pendingReply.tenantId, {
        messagesOut: 1,
        aiResponses: reply.aiGenerated ? 1 : 0,
    });
    await markPendingReplySent(pendingReply.id, sentAt);

    logger.info({ tenantId: pendingReply.tenantId, pendingReplyId: pendingReply.id }, 'Pending reply sent');
}

export async function runPendingReplyWorkerOnce(limit = 10): Promise<void> {
    const dueReplies = await claimDuePendingReplies(limit);

    for (const pendingReply of dueReplies) {
        try {
            await processPendingReply(pendingReply);
        } catch (error) {
            logger.error({ error, tenantId: pendingReply.tenantId, pendingReplyId: pendingReply.id }, 'Pending reply processing failed');

            if ((pendingReply.attempts || 0) >= MAX_PENDING_REPLY_ATTEMPTS) {
                await markPendingReplyFailed(pendingReply.id, 'max_attempts_exceeded');
                continue;
            }

            await reschedulePendingReply(
                pendingReply.id,
                buildRescheduleDate(new Date(), 'retry'),
                'processing_retry',
            );
        }
    }
}

function scheduleNextTick(): void {
    if (!started) {
        return;
    }

    workerTimer = setTimeout(async () => {
        if (running) {
            scheduleNextTick();
            return;
        }

        running = true;
        try {
            await runPendingReplyWorkerOnce();
        } catch (error) {
            logger.error({ error }, 'Pending reply worker tick failed');
        } finally {
            running = false;
            scheduleNextTick();
        }
    }, pollIntervalMs);
}

export function startPendingReplyWorker(options?: { pollIntervalMs?: number }): void {
    const enabled = process.env.ENABLE_PENDING_REPLY_WORKER !== 'false';
    if (!enabled) {
        logger.info('Pending reply worker disabled by ENABLE_PENDING_REPLY_WORKER=false');
        return;
    }

    if (started) {
        return;
    }

    pollIntervalMs = options?.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    started = true;
    logger.info({ pollIntervalMs }, 'Starting pending reply worker');
    scheduleNextTick();
}

export function stopPendingReplyWorker(): void {
    started = false;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
}
