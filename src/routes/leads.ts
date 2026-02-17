// ============================================
// OmniReply AI — Leads/CRM API Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import supabase from '../lib/db';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/leads — List leads with optional search
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const search = req.query.search as string | undefined;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('Lead')
            .select('*', { count: 'exact' })
            .eq('tenantId', tenantId)
            .order('lastContact', { ascending: false })
            .range(from, to);

        if (search) {
            query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%`);
        }

        const { data: leads, count, error } = await query;
        if (error) throw error;

        res.json({ leads, total: count || 0, page, limit });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

export default router;
