// ============================================
// OmniReply AI — Express Server Entry Point
// Multi-Tenant WhatsApp SaaS Platform
// ============================================

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import logger from './lib/utils/logger';
import { isDbConfigured } from './lib/db';

// Import routes
import authRoutes from './routes/auth';
import whatsappRoutes from './routes/whatsapp';
import knowledgeRoutes from './routes/knowledge';
import leadsRoutes from './routes/leads';
import broadcastRoutes from './routes/broadcast';
import tenantRoutes from './routes/tenant';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const ENABLE_WHATSAPP_RECONNECT_ON_BOOT = process.env.ENABLE_WHATSAPP_RECONNECT_ON_BOOT === 'true';

// ── Middleware ──
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// Handle preflight OPTIONS explicitly for Express 5
app.options('/{*path}', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(204);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging ──
app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.url }, '→ Request');
    next();
});

// ── Health Check ──
app.get('/health', (_, res) => {
    res.json({
        status: isDbConfigured ? 'ok' : 'degraded',
        service: 'OmniReply AI',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        checks: {
            dbConfigured: isDbConfigured,
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

    res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
    });
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
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
const server = app.listen(PORT, HOST, async () => {
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

process.on('SIGTERM', () => {
    logger.warn('SIGTERM received; shutting down HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

export default app;
