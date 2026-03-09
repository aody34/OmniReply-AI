// ============================================
// OmniReply AI — WhatsApp API Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { statusMonitor } from '../lib/whatsapp/status-monitor';
import logger from '../lib/utils/logger';

const router = Router();
router.use(authMiddleware);

async function loadConnector() {
    return import('../lib/whatsapp/connector');
}

/**
 * POST /api/whatsapp/connect — Start WhatsApp session
 */
router.post('/connect', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { connectSession } = await loadConnector();
        await connectSession(tenantId);
        res.json({ message: 'WhatsApp connection initiated', status: statusMonitor.getStatus(tenantId) });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to connect WhatsApp');
        res.status(500).json({ error: 'Failed to connect WhatsApp' });
    }
});

/**
 * POST /api/whatsapp/disconnect — Stop WhatsApp session
 */
router.post('/disconnect', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { disconnectSession } = await loadConnector();
        await disconnectSession(tenantId);
        res.json({ message: 'WhatsApp disconnected' });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to disconnect WhatsApp');
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

/**
 * GET /api/whatsapp/status — Check connection status
 */
router.get('/status', async (req: Request, res: Response) => {
    const status = statusMonitor.getStatus(req.auth!.tenantId);
    res.json({ status });
});

/**
 * GET /api/whatsapp/qr — Get QR code for scanning
 */
router.get('/qr', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { getQR } = await loadConnector();
        const qr = getQR(tenantId);
        if (!qr) {
            return res.status(404).json({ error: 'No QR available. Connect first or QR already scanned.' });
        }
        res.json({ qr });
    } catch (err: any) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Failed to get QR code');
        res.status(500).json({ error: 'Failed to get QR code' });
    }
});

export default router;
