import cors from 'cors';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCorsOptions, DEFAULT_ALLOWED_ORIGINS } from '../../src/lib/cors';

describe('Security: CORS preflight', () => {
    it('returns 204 with the expected CORS headers for an allowed login origin', async () => {
        const app = express();
        const corsOptions = createCorsOptions(DEFAULT_ALLOWED_ORIGINS);

        app.use(cors(corsOptions));
        app.options('/{*path}', cors(corsOptions));
        app.use(express.json());
        app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));

        const res = await request(app)
            .options('/api/auth/login')
            .set('Origin', 'https://omni-reply-ai.vercel.app')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe('https://omni-reply-ai.vercel.app');
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers['access-control-allow-methods']).toContain('OPTIONS');
        expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
        expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });
});
