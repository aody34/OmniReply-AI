import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL || '';
const hasValidDatabaseUrl = /^postgres(ql)?:\/\//.test(databaseUrl);

function runPsql(sql: string): string {
    return execFileSync(
        'psql',
        [databaseUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
        {
            encoding: 'utf8',
            env: process.env,
        },
    ).trim();
}

const dbMetadataReachable = (() => {
    if (!hasValidDatabaseUrl) {
        return false;
    }

    try {
        runPsql('SELECT 1;');
        return true;
    } catch {
        return false;
    }
})();

const tableNames = [
    'Tenant',
    'User',
    'WhatsAppSession',
    'MessageLog',
    'KnowledgeEntry',
    'Lead',
    'Broadcast',
    'DailyStat',
    'Template',
    'AutomationFlow',
    'FlowTrigger',
    'FlowCondition',
    'FlowAction',
    'TenantAutomationSettings',
    'OwnerActivity',
    'PendingReply',
    'tenants',
    'users',
    'whatsapp_sessions',
    'message_logs',
    'knowledge_entries',
    'leads',
    'broadcasts',
    'daily_stats',
    'templates',
    'automation_flows',
    'flow_triggers',
    'flow_conditions',
    'flow_actions',
    'tenant_automation_settings',
    'owner_activity',
    'pending_replies',
];

const runIf = dbMetadataReachable ? it : it.skip;

describe('Security: row level security', () => {
    runIf('reports rowsecurity=true on every tenant-owned table that exists', () => {
        const sql = `
            SELECT relname || ':' || relrowsecurity
            FROM pg_class
            WHERE relkind = 'r'
              AND relnamespace = 'public'::regnamespace
              AND relname = ANY (ARRAY['${tableNames.join("','")}'])
            ORDER BY relname;
        `;

        const output = runPsql(sql);
        const rows = output.split('\n').filter(Boolean);

        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row.endsWith(':t')).toBe(true);
        }
    });
});
