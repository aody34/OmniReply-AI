import supabase, { isDbConfigured } from './db';

type DbCheckResult = {
    ok: boolean;
    details: string;
};

export type AutomationDbHealth = {
    status: 'ok' | 'degraded';
    checks: {
        flowTriggerTable: DbCheckResult;
        enableHumanOverrideColumn: DbCheckResult;
    };
};

function toSafeDetail(error: { code?: string; message?: string; details?: string } | null | undefined, fallback: string): string {
    if (!error) return fallback;
    if (error.code && error.message) return `${error.code}: ${error.message}`.slice(0, 240);
    if (error.message) return error.message.slice(0, 240);
    if (error.details) return error.details.slice(0, 240);
    return fallback;
}

export async function getAutomationDbHealth(): Promise<AutomationDbHealth> {
    if (!isDbConfigured) {
        return {
            status: 'degraded',
            checks: {
                flowTriggerTable: { ok: false, details: 'Database client is not configured.' },
                enableHumanOverrideColumn: { ok: false, details: 'Database client is not configured.' },
            },
        };
    }

    const [flowTriggerRes, settingsColumnRes] = await Promise.all([
        supabase.from('FlowTrigger').select('id', { head: true, count: 'exact' }),
        supabase.from('TenantAutomationSettings').select('enableHumanOverride', { head: true, count: 'exact' }),
    ]);

    const flowTriggerTable = flowTriggerRes.error
        ? { ok: false, details: toSafeDetail(flowTriggerRes.error, 'FlowTrigger check failed') }
        : { ok: true, details: 'FlowTrigger table available' };

    const enableHumanOverrideColumn = settingsColumnRes.error
        ? { ok: false, details: toSafeDetail(settingsColumnRes.error, 'enableHumanOverride column check failed') }
        : { ok: true, details: 'enableHumanOverride column available' };

    return {
        status: flowTriggerTable.ok && enableHumanOverrideColumn.ok ? 'ok' : 'degraded',
        checks: {
            flowTriggerTable,
            enableHumanOverrideColumn,
        },
    };
}
