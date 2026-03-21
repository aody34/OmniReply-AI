import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';
import supabase from '../lib/db';
import logger from '../lib/utils/logger';
import { getRouteRequestContext, getSafeErrorDetails, sendRouteError } from '../lib/utils/route-response';

const router = Router();

const templatePayloadSchema = z.object({
    name: z.string().min(1).max(120),
    content: z.string().min(1).max(2000),
    variables: z.array(z.string().min(1).max(64)).default([]),
});

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'templates.list');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling template list');

        const { data, error } = await supabase
            .from('Template')
            .select('*')
            .eq('tenantId', req.auth!.tenantId)
            .order('createdAt', { ascending: false });

        if (error) {
            throw error;
        }

        res.json({ templates: data || [] });
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to fetch templates');
        logger.error({ ...ctx, details }, 'Template list failed');
        return sendRouteError(res, 500, 'TEMPLATE_LIST_FAILED', details, ctx.requestId);
    }
});

router.post('/', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'templates.create');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling template create');

        assertNoTenantOverride(req.body);
        const payload = templatePayloadSchema.parse(req.body);
        const { data, error } = await supabase
            .from('Template')
            .insert({
                tenantId: req.auth!.tenantId,
                ...payload,
            })
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({ template: data });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return sendRouteError(res, 400, 'TENANT_OVERRIDE_BLOCKED', error.message, ctx.requestId);
        }
        if (error instanceof z.ZodError) {
            return sendRouteError(res, 400, 'TEMPLATE_CREATE_INVALID', error.issues[0]?.message || 'Invalid template payload', ctx.requestId);
        }
        const details = getSafeErrorDetails(error, 'Failed to create template');
        logger.error({ ...ctx, details }, 'Template create failed');
        return sendRouteError(res, 500, 'TEMPLATE_CREATE_FAILED', details, ctx.requestId);
    }
});

router.put('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'templates.update');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling template update');

        assertNoTenantOverride(req.body);
        const payload = templatePayloadSchema.parse(req.body);
        const { data, error } = await supabase
            .from('Template')
            .update({
                ...payload,
                updatedAt: new Date().toISOString(),
            })
            .eq('id', req.params.id)
            .eq('tenantId', req.auth!.tenantId)
            .select('*')
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!data) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ template: data });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return sendRouteError(res, 400, 'TENANT_OVERRIDE_BLOCKED', error.message, ctx.requestId);
        }
        if (error instanceof z.ZodError) {
            return sendRouteError(res, 400, 'TEMPLATE_UPDATE_INVALID', error.issues[0]?.message || 'Invalid template payload', ctx.requestId);
        }
        const details = getSafeErrorDetails(error, 'Failed to update template');
        logger.error({ ...ctx, details }, 'Template update failed');
        return sendRouteError(res, 500, 'TEMPLATE_UPDATE_FAILED', details, ctx.requestId);
    }
});

router.delete('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'templates.delete');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling template delete');

        const { error } = await supabase
            .from('Template')
            .delete()
            .eq('id', req.params.id)
            .eq('tenantId', req.auth!.tenantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Template deleted' });
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to delete template');
        logger.error({ ...ctx, details }, 'Template delete failed');
        return sendRouteError(res, 500, 'TEMPLATE_DELETE_FAILED', details, ctx.requestId);
    }
});

export default router;
