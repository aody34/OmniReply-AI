// ============================================
// OmniReply AI — WhatsApp API Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { statusMonitor } from '../lib/whatsapp/status-monitor';

const router = Router();
router.use(authMiddleware);

async function loadConnector() {
    return import('../lib/whatsapp/connector');
}

/**
 * POST /api/whatsapp/connect — Start WhatsApp session
 */
router.post('/connect', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { connectSession } = await loadConnector();
        await connectSession(tenantId);
        res.json({ message: 'WhatsApp connection initiated', status: statusMonitor.getStatus(tenantId) });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to connect WhatsApp', details: err.message });
    }
});

/**
 * POST /api/whatsapp/disconnect — Stop WhatsApp session
 */
router.post('/disconnect', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { disconnectSession } = await loadConnector();
        await disconnectSession(tenantId);
        res.json({ message: 'WhatsApp disconnected' });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to disconnect', details: err.message });
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
        res.status(500).json({ error: 'Failed to get QR code', details: err.message });
    }
});

export default router;
