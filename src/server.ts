// ============================================
// OmniReply AI — Express Server Entry Point
// Multi-Tenant WhatsApp SaaS Platform
// ============================================

import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createCorsOptions, resolveAllowedOrigins } from './lib/cors';
import logger from './lib/utils/logger';
import { isDbConfigured } from './lib/db';
import { isRequestDbConfigured } from './lib/request-db';
import { createAuthRateLimiter } from './middleware/rate-limit';

// Import routes
import authRoutes from './routes/auth';
import authProfileRoutes from './routes/auth-profile';
import whatsappRoutes from './routes/whatsapp';
import knowledgeRoutes from './routes/knowledge';
import leadsRoutes from './routes/leads';
import broadcastRoutes from './routes/broadcast';
import tenantRoutes from './routes/tenant';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ENABLE_WHATSAPP_RECONNECT_ON_BOOT = process.env.ENABLE_WHATSAPP_RECONNECT_ON_BOOT === 'true';
const BODY_LIMIT = process.env.BODY_LIMIT || '1mb';
const allowedCorsOrigins = resolveAllowedOrigins();
const corsOptions: cors.CorsOptions = createCorsOptions(allowedCorsOrigins);

const authRateLimiter = createAuthRateLimiter();

function parseTrustProxy(raw: string | undefined): boolean | number | string {
    if (!raw) return process.env.NODE_ENV === 'production' ? 1 : false;
    if (raw === 'true') return 1;
    if (raw === 'false') return false;
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) return asNumber;
    return raw;
}

app.disable('x-powered-by');
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// ── Middleware ──
app.use(helmet());
app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.message === 'CORS origin not allowed') {
        return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
    }
    return next(err);
});
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);

// ── Request logging ──
app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.url }, '→ Request');
    next();
});

// ── Health Check ──
app.get('/health', (_, res) => {
    res.json({
        status: isDbConfigured && isRequestDbConfigured ? 'ok' : 'degraded',
        service: 'OmniReply AI',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        checks: {
            dbConfigured: isDbConfigured,
            requestDbConfigured: isRequestDbConfigured,
        },
    });
});

// ── Readiness Check ──
app.get('/ready', (_, res) => {
    if (!isDbConfigured) {
        return res.status(503).json({
            status: 'not_ready',
            reason: 'SUPABASE_URL or SUPABASE_SERVICE_KEY is missing',
            timestamp: new Date().toISOString(),
        });
    }

    if (!isRequestDbConfigured) {
        return res.status(503).json({
            status: 'not_ready',
            reason: 'SUPABASE_ANON_KEY or SUPABASE_JWT_SECRET is missing',
            timestamp: new Date().toISOString(),
        });
    }

    res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
    });
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/auth', authProfileRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/tenant', tenantRoutes);

// ── API Documentation (root) ──
app.get('/', (_, res) => {
    res.json({
        name: 'OmniReply AI',
        description: 'Multi-Tenant WhatsApp SaaS for Local Businesses',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            ready: 'GET /ready',
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                profile: 'GET /api/auth/me',
            },
            whatsapp: {
                connect: 'POST /api/whatsapp/connect',
                disconnect: 'POST /api/whatsapp/disconnect',
                status: 'GET /api/whatsapp/status',
                qrCode: 'GET /api/whatsapp/qr',
            },
            knowledge: {
                list: 'GET /api/knowledge',
                create: 'POST /api/knowledge',
                update: 'PUT /api/knowledge/:id',
                delete: 'DELETE /api/knowledge/:id',
            },
            leads: {
                list: 'GET /api/leads',
                search: 'GET /api/leads/search?q=...',
            },
            broadcast: {
                create: 'POST /api/broadcast',
                list: 'GET /api/broadcast',
                details: 'GET /api/broadcast/:id',
            },
            tenant: {
                settings: 'GET /api/tenant',
                update: 'PUT /api/tenant',
                dashboard: 'GET /api/tenant/dashboard',
                analytics: 'GET /api/tenant/analytics?days=7',
            },
        },
    });
});

// ── 404 Handler ──
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// ── Error Handler ──
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ error: err.message, stack: err.stack }, '❌ Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ──
console.log('ENV PORT =', process.env.PORT);
const server = app.listen(PORT, HOST, async () => {
    console.log('Listening on', HOST, PORT);
    logger.info({
        host: HOST,
        port: PORT,
    }, 'HTTP server listening');
    logger.info({
        nodeEnv: process.env.NODE_ENV || 'development',
        allowedCorsOrigins,
    }, 'HTTP CORS configuration');

    logger.info(`
╔══════════════════════════════════════════════╗
║                                              ║
║         🚀 OmniReply AI Server               ║
║         Running on port ${PORT}                  ║
║                                              ║
║   Dashboard:  http://localhost:${PORT}           ║
║   Health:     http://localhost:${PORT}/health     ║
║   API Docs:   http://localhost:${PORT}/           ║
║                                              ║
╚══════════════════════════════════════════════╝
  `);

    if (!isDbConfigured) {
        logger.warn('Database env vars missing; auth/data routes will return 503 until configured');
        return;
    }

    if (!isRequestDbConfigured) {
        logger.warn('Tenant-scoped DB env vars missing; protected API routes will return 503 until configured');
    }

    if (!ENABLE_WHATSAPP_RECONNECT_ON_BOOT) {
        logger.info('Skipping WhatsApp reconnect on startup (set ENABLE_WHATSAPP_RECONNECT_ON_BOOT=true to enable)');
        return;
    }

    // Reconnect any previously active WhatsApp sessions
    try {
        const { reconnectAllSessions } = await import('./lib/whatsapp/connector');
        await reconnectAllSessions();
    } catch (err) {
        logger.error({ error: err }, 'WhatsApp connector unavailable on startup; skipping session reconnect');
    }
});

server.on('error', (err: NodeJS.ErrnoException & { address?: string; port?: number }) => {
    logger.error({
        code: err.code,
        errno: err.errno,
        syscall: err.syscall,
        address: err.address,
        port: err.port,
        message: err.message,
    }, 'HTTP server failed to bind');
    process.exit(1);
});

process.on('SIGTERM', () => {
    logger.warn('SIGTERM received; shutting down HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (err) => {
    logger.fatal({ error: err, message: err.message, stack: err.stack }, 'Uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
});

export default app;
