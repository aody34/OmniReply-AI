import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { recordOwnerHeartbeat } from '../lib/automation/owner-activity';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
    try {
        await recordOwnerHeartbeat(req.auth!.tenantId, req.auth!.userId, 'dashboard_heartbeat');
        res.json({ ok: true, timestamp: new Date().toISOString() });
    } catch {
        res.status(500).json({ error: 'Failed to record heartbeat' });
    }
});

export default router;
