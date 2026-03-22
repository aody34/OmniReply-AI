import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryState = {
    table: string;
    action: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
    payload?: any;
    options?: any;
    filters: Array<{ column: string; value: unknown }>;
    select?: string;
    order?: { column: string; options?: any };
};

function createSupabaseMock(
    handler: (state: QueryState, mode: 'execute' | 'single' | 'maybeSingle') => any,
) {
    return {
        from(table: string) {
            const state: QueryState = {
                table,
                action: 'select',
                filters: [],
            };

            const query: any = {
                select(columns?: string) {
                    state.select = columns;
                    return query;
                },
                insert(payload: any) {
                    state.action = 'insert';
                    state.payload = payload;
                    return query;
                },
                update(payload: any) {
                    state.action = 'update';
                    state.payload = payload;
                    return query;
                },
                upsert(payload: any, options?: any) {
                    state.action = 'upsert';
                    state.payload = payload;
                    state.options = options;
                    return query;
                },
                delete() {
                    state.action = 'delete';
                    return query;
                },
                eq(column: string, value: unknown) {
                    state.filters.push({ column, value });
                    return query;
                },
                order(column: string, options?: any) {
                    state.order = { column, options };
                    return Promise.resolve(handler(state, 'execute'));
                },
                single() {
                    return Promise.resolve(handler(state, 'single'));
                },
                maybeSingle() {
                    return Promise.resolve(handler(state, 'maybeSingle'));
                },
                then(resolve: (value: any) => any, reject?: (reason: any) => any) {
                    return Promise.resolve(handler(state, 'execute')).then(resolve, reject);
                },
            };

            return query;
        },
    };
}

function signTestToken() {
    return jwt.sign(
        {
            userId: 'user-1',
            tenantId: 'tenant-1',
            email: 'owner@example.com',
            role: 'owner',
        },
        process.env.JWT_SECRET as string,
        { expiresIn: '1h' },
    );
}

async function loadRoute(modulePath: string, dbMock: any, extraMocks: Record<string, any> = {}) {
    vi.resetModules();
    vi.doMock('../../src/lib/db', () => ({
        __esModule: true,
        default: dbMock,
        isDbConfigured: true,
    }));

    for (const [path, value] of Object.entries(extraMocks)) {
        vi.doMock(path, () => value);
    }

    return import(modulePath);
}

function buildApp(router: any, mountPath = '/') {
    const app = express();
    app.use(express.json());
    app.use(mountPath, router.default);
    return app;
}

describe('Integration: admin config routes', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = 'test-jwt-secret';
    });

    it('updates automation settings with authenticated tenant context', async () => {
        const dbMock = createSupabaseMock((state, mode) => {
            if (state.table === 'TenantAutomationSettings' && state.action === 'upsert' && mode === 'single') {
                return {
                    data: {
                        id: 'settings-1',
                        ...state.payload,
                    },
                    error: null,
                };
            }

            throw new Error(`Unexpected query ${state.table}:${state.action}:${mode}`);
        });

        const route = await loadRoute('../../src/routes/settings', dbMock, {
            '../../src/lib/automation/owner-activity': {
                getOwnerActivityStatus: vi.fn().mockResolvedValue({ lastActiveAt: null, offline: false }),
            },
        });

        const app = buildApp(route, '/api/settings');
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${signTestToken()}`)
            .send({
                autoReplyMode: 'DELAYED',
                replyDelayMinutes: 20,
                offlineGraceMinutes: 10,
                workingHours: null,
                enableHumanOverride: true,
                humanOverrideMinutes: 30,
            });

        expect(res.status).toBe(200);
        expect(res.body.settings.autoReplyMode).toBe('DELAYED');
        expect(res.body.settings.replyDelayMinutes).toBe(20);
    });

    it('creates a template with tenantId on the backend', async () => {
        const dbMock = createSupabaseMock((state, mode) => {
            if (state.table === 'Template' && state.action === 'insert' && mode === 'single') {
                return {
                    data: {
                        id: 'template-1',
                        ...state.payload,
                    },
                    error: null,
                };
            }

            throw new Error(`Unexpected query ${state.table}:${state.action}:${mode}`);
        });

        const route = await loadRoute('../../src/routes/templates', dbMock);
        const app = buildApp(route, '/api/templates');
        const res = await request(app)
            .post('/api/templates')
            .set('Authorization', `Bearer ${signTestToken()}`)
            .send({
                name: 'Welcome',
                content: 'Hello {name}',
                variables: ['name'],
            });

        expect(res.status).toBe(201);
        expect(res.body.template.tenantId).toBe('tenant-1');
        expect(res.body.template.name).toBe('Welcome');
    });

    it('creates an automation flow and child records with tenantId', async () => {
        const dbMock = createSupabaseMock((state, mode) => {
            if (state.table === 'AutomationFlow' && state.action === 'insert' && mode === 'single') {
                return {
                    data: {
                        id: 'flow-1',
                        ...state.payload,
                    },
                    error: null,
                };
            }

            if (state.table === 'FlowTrigger' && state.action === 'delete' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'FlowCondition' && state.action === 'delete' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'FlowAction' && state.action === 'delete' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'FlowTrigger' && state.action === 'insert' && mode === 'single') {
                return {
                    data: {
                        id: 'trigger-1',
                        ...state.payload,
                    },
                    error: null,
                };
            }

            if (state.table === 'FlowCondition' && state.action === 'insert' && mode === 'execute') {
                expect(Array.isArray(state.payload)).toBe(true);
                expect(state.payload[0].tenantId).toBe('tenant-1');
                expect(state.payload[0].triggerId).toBe('trigger-1');
                expect(state.payload[0].kind).toBe('containsText');
                expect(state.payload[0].type).toBe('containsText');
                expect(state.payload[0].operator).toBe('contains');
                return { error: null };
            }

            if (state.table === 'FlowAction' && state.action === 'insert' && mode === 'execute') {
                expect(Array.isArray(state.payload)).toBe(true);
                expect(state.payload[0].tenantId).toBe('tenant-1');
                return { error: null };
            }

            if (state.table === 'AutomationFlow' && state.action === 'select' && mode === 'execute') {
                return {
                    data: [{
                        id: 'flow-1',
                        tenantId: 'tenant-1',
                        name: 'After Hours',
                        enabled: true,
                        priority: 0,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        Trigger: { type: 'INCOMING_MESSAGE' },
                        Condition: [],
                        Action: [{ type: 'sendText', config: { text: 'We will reply soon' } }],
                    }],
                    error: null,
                };
            }

            throw new Error(`Unexpected query ${state.table}:${state.action}:${mode}`);
        });

        const route = await loadRoute('../../src/routes/automations', dbMock);
        const app = buildApp(route, '/api/automations');
        const res = await request(app)
            .post('/api/automations')
            .set('Authorization', `Bearer ${signTestToken()}`)
            .send({
                name: 'After Hours',
                enabled: true,
                priority: 0,
                trigger: { type: 'INCOMING_MESSAGE' },
                conditions: [{ type: 'containsText', value: ['hello'] }],
                actions: [{ type: 'sendText', config: { text: 'We will reply soon' } }],
            });

        expect(res.status).toBe(201);
        expect(res.body.flow.id).toBe('flow-1');
        expect(res.body.flow.tenantId).toBe('tenant-1');
    });

    it('creates an automation flow with zero conditions without inserting FlowCondition rows', async () => {
        let flowConditionInserted = false;

        const dbMock = createSupabaseMock((state, mode) => {
            if (state.table === 'AutomationFlow' && state.action === 'insert' && mode === 'single') {
                return {
                    data: {
                        id: 'flow-2',
                        ...state.payload,
                    },
                    error: null,
                };
            }

            if (state.table === 'FlowTrigger' && state.action === 'delete' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'FlowCondition' && state.action === 'delete' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'FlowAction' && state.action === 'delete' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'FlowTrigger' && state.action === 'insert' && mode === 'single') {
                return {
                    data: {
                        id: 'trigger-2',
                        ...state.payload,
                    },
                    error: null,
                };
            }

            if (state.table === 'FlowCondition' && state.action === 'insert' && mode === 'execute') {
                flowConditionInserted = true;
                return { error: null };
            }

            if (state.table === 'FlowAction' && state.action === 'insert' && mode === 'execute') {
                return { error: null };
            }

            if (state.table === 'AutomationFlow' && state.action === 'select' && mode === 'execute') {
                return {
                    data: [{
                        id: 'flow-2',
                        tenantId: 'tenant-1',
                        name: 'No Conditions',
                        enabled: true,
                        priority: 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        Trigger: { type: 'INCOMING_MESSAGE' },
                        Condition: [],
                        Action: [{ type: 'sendText', config: { text: 'We will reply soon' } }],
                    }],
                    error: null,
                };
            }

            throw new Error(`Unexpected query ${state.table}:${state.action}:${mode}`);
        });

        const route = await loadRoute('../../src/routes/automations', dbMock);
        const app = buildApp(route, '/api/automations');
        const res = await request(app)
            .post('/api/automations')
            .set('Authorization', `Bearer ${signTestToken()}`)
            .send({
                name: 'No Conditions',
                enabled: true,
                priority: 1,
                trigger: { type: 'INCOMING_MESSAGE' },
                conditions: [],
                actions: [{ type: 'sendText', config: { text: 'We will reply soon' } }],
            });

        expect(res.status).toBe(201);
        expect(flowConditionInserted).toBe(false);
        expect(res.body.flow.id).toBe('flow-2');
    });
});
