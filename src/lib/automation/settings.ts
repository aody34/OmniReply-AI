import { z } from 'zod';
import supabase from '../db';
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

function normalizeRow(row: any): TenantAutomationSettings {
    return tenantAutomationSettingsSchema.parse({
        autoReplyMode: row?.autoReplyMode,
        replyDelayMinutes: row?.replyDelayMinutes,
        offlineGraceMinutes: row?.offlineGraceMinutes,
        workingHours: row?.workingHours,
        enableHumanOverride: row?.enableHumanOverride,
        humanOverrideMinutes: row?.humanOverrideMinutes,
    });
}

export async function getTenantAutomationSettings(tenantId: string): Promise<TenantAutomationSettings> {
    const { data, error } = await supabase
        .from('TenantAutomationSettings')
        .select('*')
        .eq('tenantId', tenantId)
        .maybeSingle();

    if (error) {
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
        throw error;
    }

    return normalizeRow(data);
}

export { DEFAULT_AUTOMATION_SETTINGS };
