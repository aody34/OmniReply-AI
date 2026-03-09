import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const tables: Record<string, Row[]> = {};

function matchesFilters(row: Row, filters: Array<{ column: string; value: any }>) {
    return filters.every(({ column, value }) => row[column] === value);
}

const tenantDbMock = {
    from(table: string) {
        const filters: Array<{ column: string; value: any }> = [];
        let inserted: Row | null = null;

        return {
            select() {
                return this;
            },
            eq(column: string, value: any) {
                filters.push({ column, value });
                return this;
            },
            order() {
                return this;
            },
            insert(payload: Row) {
                inserted = { id: payload.id || `row-${Date.now()}`, ...payload };
                return this;
            },
            async single() {
                if (inserted) {
                    tables[table] = tables[table] || [];
                    tables[table].push(inserted);
                    return { data: inserted, error: null };
                }

                const rows = tables[table] || [];
                const found = rows.find((row) => matchesFilters(row, filters));
                if (!found) {
                    return { data: null, error: { message: 'Not found' } };
                }
                return { data: found, error: null };
            },
        };
    },
};

vi.mock('../../src/middleware/request-db', () => ({
    __esModule: true,
    requestDbMiddleware(req: express.Request, _res: express.Response, next: express.NextFunction) {
        req.tenantDb = tenantDbMock as any;
        next();
    },
}));

vi.mock('../../src/lib/utils/logger', () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
    },
}));

describe('Security: tenant isolation', () => {
    let broadcastRoutes: express.Router;
    let knowledgeRoutes: express.Router;
    const jwtSecret = 'test-jwt-secret';

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = jwtSecret;
        vi.resetModules();
        ({ default: broadcastRoutes } = await import('../../src/routes/broadcast'));
        ({ default: knowledgeRoutes } = await import('../../src/routes/knowledge'));
    });

    beforeEach(() => {
        tables.Broadcast = [
            { id: 'broadcast-tenant-a', tenantId: 'tenant-a', message: 'Hello A', status: 'pending' },
            { id: 'broadcast-tenant-b', tenantId: 'tenant-b', message: 'Hello B', status: 'pending' },
        ];
        tables.KnowledgeEntry = [];
    });

    function buildToken(tenantId: string) {
        return jwt.sign(
            {
                userId: `user-${tenantId}`,
                tenantId,
                email: `${tenantId}@example.com`,
                role: 'owner',
            },
            jwtSecret,
            { expiresIn: '1h' },
        );
    }

    function buildApp() {
        const app = express();
        app.use(express.json());
        app.use('/api/broadcast', broadcastRoutes);
        app.use('/api/knowledge', knowledgeRoutes);
        return app;
    }

    it('allows access to a record owned by the same tenant', async () => {
        const app = buildApp();
        const token = buildToken('tenant-a');

        const res = await request(app)
            .get('/api/broadcast/broadcast-tenant-a')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.broadcast.id).toBe('broadcast-tenant-a');
        expect(res.body.broadcast.tenantId).toBe('tenant-a');
    });

    it('denies cross-tenant reads to another tenant record', async () => {
        const app = buildApp();
        const token = buildToken('tenant-a');

        const res = await request(app)
            .get('/api/broadcast/broadcast-tenant-b')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Broadcast not found');
    });

    it('rejects tenantId overrides on tenant-owned writes', async () => {
        const app = buildApp();
        const token = buildToken('tenant-a');

        const res = await request(app)
            .post('/api/knowledge')
            .set('Authorization', `Bearer ${token}`)
            .send({
                tenantId: 'tenant-b',
                category: 'faq',
                title: 'Unsafe write',
                content: 'This must be rejected.',
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/tenantId must be derived/i);
        expect(tables.KnowledgeEntry).toHaveLength(0);
    });
});
