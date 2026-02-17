// ============================================
// OmniReply AI — Tenant Settings & Dashboard Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import supabase from '../lib/db';
import { statusMonitor } from '../lib/whatsapp/status-monitor';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/tenant/settings — Get tenant settings
 */
router.get('/settings', async (req: Request, res: Response) => {
    try {
        const { data: tenant, error } = await supabase
            .from('Tenant')
            .select('*')
            .eq('id', req.auth!.tenantId)
            .single();

        if (error || !tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ tenant });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * PUT /api/tenant/settings — Update tenant settings
 */
router.put('/settings', async (req: Request, res: Response) => {
    try {
        const { name, businessType, aiPersonality, maxDailyMessages } = req.body;

        const updateData: any = { updatedAt: new Date().toISOString() };
        if (name) updateData.name = name;
        if (businessType) updateData.businessType = businessType;
        if (aiPersonality) updateData.aiPersonality = aiPersonality;
        if (maxDailyMessages) updateData.maxDailyMessages = maxDailyMessages;

        const { data: tenant, error } = await supabase
            .from('Tenant')
            .update(updateData)
            .eq('id', req.auth!.tenantId)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Settings updated', tenant });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * GET /api/tenant/dashboard — Overview stats
 */
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const today = new Date().toISOString().split('T')[0];

        // Parallel queries
        const [tenantRes, statsRes, leadsRes, whatsappStatus] = await Promise.all([
            supabase.from('Tenant').select('*').eq('id', tenantId).single(),
            supabase.from('DailyStat').select('*').eq('tenantId', tenantId).eq('date', today).single(),
            supabase.from('Lead').select('id', { count: 'exact' }).eq('tenantId', tenantId),
            Promise.resolve(statusMonitor.getStatus(tenantId)),
        ]);

        const tenant = tenantRes.data;
        const todayStats = statsRes.data;

        res.json({
            tenant: { name: tenant?.name, plan: tenant?.plan },
            whatsappStatus,
            today: {
                messagesIn: todayStats?.messagesIn || 0,
                messagesOut: todayStats?.messagesOut || 0,
                aiResponses: todayStats?.aiResponses || 0,
                newLeads: todayStats?.newLeads || 0,
            },
            totalLeads: leadsRes.count || 0,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

/**
 * GET /api/tenant/analytics — Historical data
 */
router.get('/analytics', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const days = parseInt(req.query.days as string) || 7;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: stats, error } = await supabase
            .from('DailyStat')
            .select('*')
            .eq('tenantId', tenantId)
            .gte('date', startDate.toISOString().split('T')[0])
            .order('date', { ascending: true });

        if (error) throw error;

        res.json({
            period: `${days} days`,
            stats: stats || [],
            totals: (stats || []).reduce(
                (acc: any, s: any) => ({
                    messagesIn: acc.messagesIn + (s.messagesIn || 0),
                    messagesOut: acc.messagesOut + (s.messagesOut || 0),
                    aiResponses: acc.aiResponses + (s.aiResponses || 0),
                    newLeads: acc.newLeads + (s.newLeads || 0),
                }),
                { messagesIn: 0, messagesOut: 0, aiResponses: 0, newLeads: 0 }
            ),
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

export default router;
