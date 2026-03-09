import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const protectedRouteFiles = [
    'src/routes/auth-profile.ts',
    'src/routes/broadcast.ts',
    'src/routes/knowledge.ts',
    'src/routes/leads.ts',
    'src/routes/tenant.ts',
    'src/routes/whatsapp.ts',
];

describe('Security: service-role bypass', () => {
    it('does not import the raw service-role Supabase client in authenticated route modules', () => {
        for (const relativePath of protectedRouteFiles) {
            const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
            expect(source).not.toMatch(/from ['"]\.\.\/lib\/db['"]/);
        }
    });

    it('requires request-scoped Supabase credentials for tenant APIs', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'src/lib/request-db.ts'), 'utf8');

        expect(source).toContain('SUPABASE_ANON_KEY');
        expect(source).toContain('SUPABASE_JWT_SECRET');
        expect(source).toContain('RequestDbConfigurationError');
    });
});
