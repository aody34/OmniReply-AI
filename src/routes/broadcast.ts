// ============================================
// OmniReply AI — Broadcast API Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import supabase from '../lib/db';
import logger from '../lib/utils/logger';

const router = Router();
router.use(authMiddleware);

/**
 * POST /api/broadcast — Create broadcast
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { message, recipients, scheduledAt } = req.body;

        if (!message || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'message and recipients[] are required' });
        }

        const { data: broadcast, error } = await supabase
            .from('Broadcast')
            .insert({
                tenantId,
                message,
                recipients,
                scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            })
            .select()
            .single();

        if (error) throw error;

        logger.info({ tenantId, broadcastId: broadcast.id, recipientCount: recipients.length }, '📢 Broadcast created');

        if (!scheduledAt) {
            void (async () => {
                try {
                    const { executeBroadcast } = await import('../lib/broadcast/broadcaster');
                    await executeBroadcast(broadcast.id);
                } catch (err) {
                    logger.error({ error: err, broadcastId: broadcast.id }, 'Broadcast execution failed');
                }
            })();
        }

        res.status(201).json({
            message: scheduledAt ? 'Broadcast scheduled' : 'Broadcast started',
            broadcast: {
                id: broadcast.id,
                recipientCount: recipients.length,
                status: broadcast.status,
            },
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create broadcast' });
    }
});

/**
 * GET /api/broadcast — List broadcasts
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;

        const { data: broadcasts, error } = await supabase
            .from('Broadcast')
            .select('id, message, sentCount, failedCount, status, createdAt, completedAt, recipients')
            .eq('tenantId', tenantId)
            .order('createdAt', { ascending: false });

        if (error) throw error;

        res.json({
            broadcasts: (broadcasts || []).map((b: any) => ({
                ...b,
                recipientCount: b.recipients?.length || 0,
                recipients: undefined,
            })),
            total: broadcasts?.length || 0,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch broadcasts' });
    }
});

/**
 * GET /api/broadcast/:id — Get broadcast details
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const id = req.params.id as string;

        const { data: broadcast, error } = await supabase
            .from('Broadcast')
            .select('*')
            .eq('id', id)
            .eq('tenantId', tenantId)
            .single();

        if (error || !broadcast) {
            return res.status(404).json({ error: 'Broadcast not found' });
        }

        res.json({ broadcast });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch broadcast' });
    }
});

export default router;
