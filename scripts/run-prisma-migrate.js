#!/usr/bin/env node

const { spawnSync } = require('child_process');
require('dotenv').config({ quiet: true });

function redactDatabaseUrl(raw) {
    if (!raw) return null;

    try {
        const parsed = new URL(raw);
        const protocol = parsed.protocol || 'postgresql:';
        const authUser = parsed.username ? `${parsed.username}:***@` : '';
        const port = parsed.port ? `:${parsed.port}` : '';
        const pathname = parsed.pathname || '';
        const search = parsed.search || '';
        return `${protocol}//${authUser}${parsed.hostname}${port}${pathname}${search}`;
    } catch {
        return '[invalid-database-url]';
    }
}

function classifyP1001(output, usedUrl) {
    const text = String(output || '');
    if (!/P1001/.test(text)) return null;

    const host = (() => {
        try {
            return new URL(usedUrl).hostname;
        } catch {
            return 'unknown-host';
        }
    })();

    return [
        'Prisma P1001: database host is unreachable.',
        `Migration host: ${host}`,
        'Check one of these:',
        '1. Supabase project is paused.',
        '2. DATABASE_URL is using the wrong host or the pooler host instead of the direct host.',
        '3. Railway cannot reach the selected host due to network restrictions.',
        '4. Add ?sslmode=require to the connection string if missing.',
    ].join(' ');
}

function sanitize(text) {
    return String(text || '')
        .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted-url]')
        .replace(/(password=)[^&\s]+/gi, '$1[redacted]')
        .replace(/(api[_-]?key=)[^&\s]+/gi, '$1[redacted]');
}

const databaseUrl = process.env.DATABASE_URL || '';
const directUrl = process.env.DIRECT_URL || '';
const migrationUrl = directUrl || databaseUrl;

if (!migrationUrl) {
    console.error('[db:migrate] DATABASE_URL is missing. Prisma migrations cannot run.');
    process.exit(1);
}

const redacted = redactDatabaseUrl(migrationUrl);
console.log(`[db:migrate] migration URL source: ${directUrl ? 'DIRECT_URL' : 'DATABASE_URL'}`);
console.log(`[db:migrate] migration URL host: ${redacted}`);

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
    npxCmd,
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
        stdio: 'pipe',
        encoding: 'utf8',
        env: {
            ...process.env,
            DATABASE_URL: migrationUrl,
            DIRECT_URL: directUrl || migrationUrl,
        },
    },
);

if (result.status === 0) {
    console.log('[db:migrate] prisma migrate deploy completed successfully.');
    process.exit(0);
}

const combined = sanitize(`${result.stdout || ''}\n${result.stderr || ''}`.trim());
const classified = classifyP1001(combined, migrationUrl);

console.error('[db:migrate] prisma migrate deploy failed.');
if (classified) {
    console.error(`[db:migrate] ${classified}`);
} else {
    const firstLine = combined.split('\n').find(Boolean) || `unknown error (exit code: ${result.status ?? 'n/a'})`;
    console.error(`[db:migrate] ${firstLine}`);
}

process.exit(result.status || 1);
