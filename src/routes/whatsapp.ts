// ============================================
// OmniReply AI — WhatsApp API Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { createWhatsAppRateLimiter } from '../middleware/rate-limit';
import { getCanonicalWhatsAppStatus, hasFreshQr, setCanonicalWhatsAppState } from '../lib/whatsapp/session-state';
import logger from '../lib/utils/logger';

const router = Router();
router.use(authMiddleware);
const whatsappRateLimiter = createWhatsAppRateLimiter();

async function loadConnector() {
    return import('../lib/whatsapp/connector');
}

function applyNoStore(res: Response): void {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

/**
 * POST /api/whatsapp/connect — Start WhatsApp session
 */
router.post('/connect', whatsappRateLimiter, requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const force = Boolean(req.body?.force);
        const { connectSession, refreshQrSession } = await loadConnector();
        let status = await getCanonicalWhatsAppStatus(tenantId);

        if (force) {
            await refreshQrSession(tenantId);
        } else if (hasFreshQr(status)) {
            applyNoStore(res);
            return res.json({ message: 'WhatsApp QR available', status });
        } else if (status.state === 'QR' && !hasFreshQr(status)) {
            await refreshQrSession(tenantId);
        } else {
            await connectSession(tenantId);
        }

        status = await getCanonicalWhatsAppStatus(tenantId);
        applyNoStore(res);
        res.json({ message: 'WhatsApp connection initiated', status });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to connect WhatsApp');
        await setCanonicalWhatsAppState(req.auth!.tenantId, {
            state: 'ERROR',
            reason: 'Temporary WhatsApp login issue. Please try connecting again.',
        }).catch(() => undefined);
        res.status(500).json({ error: 'Failed to connect WhatsApp' });
    }
});

/**
 * POST /api/whatsapp/disconnect — Stop WhatsApp session
 */
router.post('/disconnect', whatsappRateLimiter, requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { disconnectSession } = await loadConnector();
        await disconnectSession(tenantId);
        const status = await getCanonicalWhatsAppStatus(tenantId);
        applyNoStore(res);
        res.json({ message: 'WhatsApp disconnected', status });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to disconnect WhatsApp');
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

/**
 * GET /api/whatsapp/status — Check connection status
 */
router.get('/status', async (req: Request, res: Response) => {
    applyNoStore(res);
    try {
        const tenantId = req.auth!.tenantId;
        const status = await getCanonicalWhatsAppStatus(tenantId);
        if (status.state === 'QR' && !hasFreshQr(status)) {
            const { refreshQrSession } = await loadConnector();
            await refreshQrSession(tenantId);
            const refreshed = await getCanonicalWhatsAppStatus(tenantId);
            return res.json({
                ...refreshed,
                serverTime: new Date().toISOString(),
                tenantId,
            });
        }

        res.json({
            ...status,
            serverTime: new Date().toISOString(),
            tenantId,
        });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to resolve WhatsApp status');
        res.json({
            tenantId: req.auth!.tenantId,
            sessionId: null,
            state: 'ERROR',
            qr: null,
            qrCreatedAt: null,
            reason: 'Temporary WhatsApp login issue. Please try again shortly.',
            phoneNumber: null,
            updatedAt: new Date().toISOString(),
            lastSeenAt: null,
            connectedAt: null,
            disconnectedAt: null,
            serverTime: new Date().toISOString(),
        });
    }
});

/**
 * GET /api/whatsapp/qr — Get QR code for scanning
 */
router.get('/qr', async (req: Request, res: Response) => {
    try {
        applyNoStore(res);
        const status = await getCanonicalWhatsAppStatus(req.auth!.tenantId);
        if (status.state !== 'QR' || !status.qr) {
            return res.status(404).json({ error: 'No QR available. Connect first or QR already scanned.' });
        }
        res.json({ qr: status.qr, updatedAt: status.updatedAt, qrCreatedAt: status.qrCreatedAt, tenantId: req.auth!.tenantId });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to get QR code');
        res.status(500).json({ error: 'Failed to get QR code' });
    }
});

export default router;
