import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { requestDbMiddleware } from '../middleware/request-db';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';

const router = Router();

const templatePayloadSchema = z.object({
    name: z.string().min(1).max(120),
    content: z.string().min(1).max(2000),
    variables: z.array(z.string().min(1).max(64)).default([]),
});

router.use(authMiddleware);
router.use(requestDbMiddleware);

router.get('/', async (req: Request, res: Response) => {
    try {
        const { data, error } = await req.tenantDb!
            .from('Template')
            .select('*')
            .eq('tenantId', req.auth!.tenantId)
            .order('createdAt', { ascending: false });

        if (error) {
            throw error;
        }

        res.json({ templates: data || [] });
    } catch {
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

router.post('/', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        assertNoTenantOverride(req.body);
        const payload = templatePayloadSchema.parse(req.body);
        const { data, error } = await req.tenantDb!
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
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0]?.message || 'Invalid template payload' });
        }
        return res.status(500).json({ error: 'Failed to create template' });
    }
});

router.put('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        assertNoTenantOverride(req.body);
        const payload = templatePayloadSchema.parse(req.body);
        const { data, error } = await req.tenantDb!
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
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0]?.message || 'Invalid template payload' });
        }
        return res.status(500).json({ error: 'Failed to update template' });
    }
});

router.delete('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const { error } = await req.tenantDb!
            .from('Template')
            .delete()
            .eq('id', req.params.id)
            .eq('tenantId', req.auth!.tenantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Template deleted' });
    } catch {
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

export default router;
