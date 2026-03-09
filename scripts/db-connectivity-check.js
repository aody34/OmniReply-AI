#!/usr/bin/env node

const { spawnSync } = require('child_process');
require('dotenv').config({ quiet: true });

function sanitize(text) {
    return String(text || '')
        .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted-url]')
        .replace(/(password=)[^&\s]+/gi, '$1[redacted]')
        .replace(/(api[_-]?key=)[^&\s]+/gi, '$1[redacted]');
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const hasDirectUrl = Boolean(process.env.DIRECT_URL);
const hasValidDatabaseProtocol = /^(postgresql|postgres):\/\//i.test(process.env.DATABASE_URL || '');

console.log(`[db-check] DATABASE_URL set: ${hasDatabaseUrl}`);
console.log(`[db-check] DIRECT_URL set: ${hasDirectUrl}`);
console.log(`[db-check] DATABASE_URL protocol valid: ${hasValidDatabaseProtocol}`);

if (!hasDatabaseUrl) {
    console.error('[db-check] DATABASE_URL is missing');
    process.exit(1);
}

if (!hasValidDatabaseProtocol) {
    console.error('[db-check] DATABASE_URL must start with postgresql:// or postgres://');
    process.exit(1);
}

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
    npxCmd,
    ['prisma', 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
    {
        input: 'SELECT 1;',
        encoding: 'utf8',
        env: process.env,
    },
);

if (result.status === 0) {
    console.log('[db-check] database connectivity: ok');
    process.exit(0);
}

const details = sanitize(result.stderr || result.stdout || result.error?.message || '').trim();
const firstLine = details.split('\n').find(Boolean) || `unknown error (exit code: ${result.status ?? 'n/a'})`;
console.error(`[db-check] database connectivity: failed`);
console.error(`[db-check] reason: ${firstLine}`);
process.exit(1);
