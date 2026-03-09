import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthRateLimiter } from '../../src/middleware/rate-limit';

describe('Security: auth rate limiting', () => {
    it('limits repeated login attempts with HTTP 429', async () => {
        const app = express();
        app.use(express.json());
        app.post(
            '/api/auth/login',
            createAuthRateLimiter({ windowMs: 60_000, max: 2 }),
            (_req, res) => res.json({ ok: true }),
        );

        const first = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'secret123' });
        const second = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'secret123' });
        const third = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'secret123' });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(third.status).toBe(429);
        expect(third.body.error).toMatch(/Too many authentication attempts/i);
    });
});

