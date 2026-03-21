import { z } from 'zod';
import supabase from '../db';
import logger from '../utils/logger';
import {
    AUTO_REPLY_MODES,
    DEFAULT_AUTOMATION_SETTINGS,
    TenantAutomationSettings,
} from './types';

const workingHoursSchema = z.object({
    enabled: z.boolean().optional(),
    start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().min(1).optional(),
}).nullable().optional();

export const tenantAutomationSettingsSchema = z.object({
    autoReplyMode: z.enum(AUTO_REPLY_MODES).default(DEFAULT_AUTOMATION_SETTINGS.autoReplyMode),
    replyDelayMinutes: z.number().int().min(1).default(DEFAULT_AUTOMATION_SETTINGS.replyDelayMinutes),
    offlineGraceMinutes: z.number().int().min(1).default(DEFAULT_AUTOMATION_SETTINGS.offlineGraceMinutes),
    workingHours: workingHoursSchema.default(DEFAULT_AUTOMATION_SETTINGS.workingHours),
    enableHumanOverride: z.boolean().default(DEFAULT_AUTOMATION_SETTINGS.enableHumanOverride),
    humanOverrideMinutes: z.number().int().min(1).default(DEFAULT_AUTOMATION_SETTINGS.humanOverrideMinutes),
});

let loggedSettingsFallback = false;

function isSchemaMismatchError(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined): boolean {
    const code = (error?.code || '').toUpperCase();
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

    return (
        code === '42703' ||
        code === '42P01' ||
        code === 'PGRST204' ||
        code === 'PGRST205' ||
        text.includes('could not find the') ||
        text.includes('schema cache') ||
        text.includes('column') ||
        text.includes('relation') ||
        text.includes('does not exist')
    );
}

function logFallback(error: { code?: string; message?: string }): void {
    if (loggedSettingsFallback) return;
    loggedSettingsFallback = true;
    logger.warn({ code: error.code, message: error.message }, 'TenantAutomationSettings schema unavailable; using default automation settings until migration is applied');
}

function normalizeRow(row: any): TenantAutomationSettings {
    return tenantAutomationSettingsSchema.parse({
        autoReplyMode: row?.autoReplyMode,
        replyDelayMinutes: row?.replyDelayMinutes,
        offlineGraceMinutes: row?.offlineGraceMinutes,
        workingHours: row?.workingHours,
        enableHumanOverride: row?.enableHumanOverride ?? row?.pauseOnHumanReply,
        humanOverrideMinutes: row?.humanOverrideMinutes ?? row?.humanOverridePauseMinutes,
    });
}

export async function getTenantAutomationSettings(tenantId: string): Promise<TenantAutomationSettings> {
    const { data, error } = await supabase
        .from('TenantAutomationSettings')
        .select('*')
        .eq('tenantId', tenantId)
        .maybeSingle();

    if (error) {
        if (isSchemaMismatchError(error)) {
            logFallback(error);
            return DEFAULT_AUTOMATION_SETTINGS;
        }
        throw error;
    }

    if (!data) {
        return DEFAULT_AUTOMATION_SETTINGS;
    }

    return normalizeRow(data);
}

export async function upsertTenantAutomationSettings(
    tenantId: string,
    input: unknown,
): Promise<TenantAutomationSettings> {
    const parsed = tenantAutomationSettingsSchema.parse(input);

    const payload = {
        tenantId,
        ...parsed,
        updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('TenantAutomationSettings')
        .upsert(payload, { onConflict: 'tenantId' })
        .select('*')
        .single();

    if (error) {
        if (isSchemaMismatchError(error)) {
            const legacyPayload = {
                tenantId,
                autoReplyMode: parsed.autoReplyMode,
                replyDelayMinutes: parsed.replyDelayMinutes,
                offlineGraceMinutes: parsed.offlineGraceMinutes,
                workingHours: parsed.workingHours,
                pauseOnHumanReply: parsed.enableHumanOverride,
                humanOverridePauseMinutes: parsed.humanOverrideMinutes,
                updatedAt: new Date().toISOString(),
            };

            const legacyRes = await supabase
                .from('TenantAutomationSettings')
                .upsert(legacyPayload, { onConflict: 'tenantId' })
                .select('*')
                .single();

            if (legacyRes.error) {
                logFallback(error);
                return parsed;
            }

            return normalizeRow(legacyRes.data);
        }
        throw error;
    }

    return normalizeRow(data);
}

export { DEFAULT_AUTOMATION_SETTINGS };
