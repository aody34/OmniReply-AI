// ============================================
// OmniReply AI — Tenant Settings & Dashboard Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';
import { getCanonicalWhatsAppStatus } from '../lib/whatsapp/session-state';
import supabase from '../lib/db';
import logger from '../lib/utils/logger';
import { getRouteRequestContext, getSafeErrorDetails, sendRouteError } from '../lib/utils/route-response';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/tenant/settings — Get tenant settings
 */
router.get('/settings', async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'tenant.settings.get');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling tenant settings fetch');

        const { data: tenant, error } = await supabase
            .from('Tenant')
            .select('*')
            .eq('id', req.auth.tenantId)
            .single();

        if (error || !tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ tenant });
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to fetch tenant settings');
        logger.error({ ...ctx, details }, 'Tenant settings fetch failed');
        return sendRouteError(res, 500, 'TENANT_SETTINGS_FETCH_FAILED', details, ctx.requestId);
    }
});

/**
 * PUT /api/tenant/settings — Update tenant settings
 */
router.put('/settings', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'tenant.settings.update');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling tenant settings update');

        assertNoTenantOverride(req.body);
        const { name, businessType, aiPersonality, maxDailyMessages } = req.body;

        const updateData: any = { updatedAt: new Date().toISOString() };
        if (name) updateData.name = name;
        if (businessType) updateData.businessType = businessType;
        if (aiPersonality) updateData.aiPersonality = aiPersonality;
        if (maxDailyMessages) updateData.maxDailyMessages = maxDailyMessages;

        const { data: tenant, error } = await supabase
            .from('Tenant')
            .update(updateData)
            .eq('id', req.auth.tenantId)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Settings updated', tenant });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return sendRouteError(res, 400, 'TENANT_OVERRIDE_BLOCKED', error.message, ctx.requestId);
        }
        const details = getSafeErrorDetails(error, 'Failed to update settings');
        logger.error({ ...ctx, details }, 'Tenant settings update failed');
        return sendRouteError(res, 500, 'TENANT_SETTINGS_UPDATE_FAILED', details, ctx.requestId);
    }
});

/**
 * GET /api/tenant/dashboard — Overview stats
 */
router.get('/dashboard', async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'tenant.dashboard');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }
        const tenantId = req.auth.tenantId;
        const today = new Date().toISOString().split('T')[0];

        // Parallel queries
        const [tenantRes, statsRes, leadsRes, whatsappStatus] = await Promise.all([
            supabase.from('Tenant').select('*').eq('id', tenantId).single(),
            supabase.from('DailyStat').select('*').eq('tenantId', tenantId).eq('date', today).single(),
            supabase.from('Lead').select('id', { count: 'exact' }).eq('tenantId', tenantId),
            getCanonicalWhatsAppStatus(tenantId),
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
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to fetch dashboard');
        logger.error({ ...ctx, details }, 'Tenant dashboard fetch failed');
        return sendRouteError(res, 500, 'TENANT_DASHBOARD_FETCH_FAILED', details, ctx.requestId);
    }
});

/**
 * GET /api/tenant/analytics — Historical data
 */
router.get('/analytics', async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'tenant.analytics');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }
        const tenantId = req.auth.tenantId;
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
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to fetch analytics');
        logger.error({ ...ctx, details }, 'Tenant analytics fetch failed');
        return sendRouteError(res, 500, 'TENANT_ANALYTICS_FETCH_FAILED', details, ctx.requestId);
    }
});

export default router;
