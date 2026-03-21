import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const requestScopedRouteFiles = [
    'src/routes/auth-profile.ts',
    'src/routes/broadcast.ts',
    'src/routes/knowledge.ts',
    'src/routes/leads.ts',
    'src/routes/whatsapp.ts',
];

const serviceRoleRouteFiles = [
    'src/routes/settings.ts',
    'src/routes/templates.ts',
    'src/routes/automations.ts',
    'src/routes/tenant.ts',
];

describe('Security: service-role bypass', () => {
    it('keeps request-scoped clients on routes that should not bypass RLS', () => {
        for (const relativePath of requestScopedRouteFiles) {
            const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
            expect(source).not.toMatch(/from ['"]\.\.\/lib\/db['"]/);
        }
    });

    it('allows backend service-role writes on configuration routes', () => {
        for (const relativePath of serviceRoleRouteFiles) {
            const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
            expect(source).toMatch(/from ['"]\.\.\/lib\/db['"]|from ['"]\.\.\/lib\/automation\/settings['"]/);
        }
    });

    it('requires request-scoped Supabase credentials for tenant APIs', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'src/lib/request-db.ts'), 'utf8');

        expect(source).toContain('SUPABASE_ANON_KEY');
        expect(source).toContain('SUPABASE_JWT_SECRET');
        expect(source).toContain('RequestDbConfigurationError');
    });
});
