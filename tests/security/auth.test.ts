import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

describe('Security: auth middleware', () => {
    let authMiddleware: any;
    const jwtSecret = 'test-jwt-secret';

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = jwtSecret;
        vi.resetModules();
        ({ authMiddleware } = await import('../../src/middleware/auth'));
    });

    function buildApp() {
        const app = express();
        app.get('/protected', authMiddleware, (req, res) => {
            res.json({ ok: true, tenantId: req.user?.tenantId, role: req.user?.role });
        });
        return app;
    }

    it('returns 401 when no token is provided', async () => {
        const app = buildApp();
        const res = await request(app).get('/protected');

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Authentication required/i);
    });

    it('returns 401 when token is expired', async () => {
        const app = buildApp();
        const expiredToken = jwt.sign(
            {
                userId: 'user-1',
                tenantId: 'tenant-1',
                email: 'owner@example.com',
                role: 'owner',
            },
            jwtSecret,
            { expiresIn: -1 },
        );

        const res = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${expiredToken}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid or expired token');
    });
});

