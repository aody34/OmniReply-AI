// ============================================
// OmniReply AI — Knowledge Base API Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import supabase from '../lib/db';
import logger from '../lib/utils/logger';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/knowledge — List entries
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const category = req.query.category as string | undefined;

        let query = supabase
            .from('KnowledgeEntry')
            .select('*')
            .eq('tenantId', tenantId)
            .order('createdAt', { ascending: false });

        if (category) query = query.eq('category', category);

        const { data: entries, error } = await query;
        if (error) throw error;

        res.json({ entries, total: entries?.length || 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch knowledge entries' });
    }
});

/**
 * POST /api/knowledge — Create entry
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const { category, title, content } = req.body;

        if (!category || !title || !content) {
            return res.status(400).json({ error: 'category, title, and content are required' });
        }

        const validCategories = ['menu', 'faq', 'policy', 'price_list', 'hours', 'general'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
            });
        }

        const { data: entry, error } = await supabase
            .from('KnowledgeEntry')
            .insert({ tenantId, category, title, content })
            .select()
            .single();

        if (error) throw error;

        logger.info({ tenantId, entryId: entry.id, category, title }, '📚 Knowledge entry created');
        res.status(201).json({ message: 'Knowledge entry created', entry });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create knowledge entry' });
    }
});

/**
 * PUT /api/knowledge/:id — Update entry
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const id = req.params.id as string;
        const { category, title, content, isActive } = req.body;

        // Ensure the entry belongs to this tenant
        const { data: existing } = await supabase
            .from('KnowledgeEntry')
            .select('id')
            .eq('id', id)
            .eq('tenantId', tenantId)
            .single();

        if (!existing) {
            return res.status(404).json({ error: 'Knowledge entry not found' });
        }

        const updateData: any = {};
        if (category) updateData.category = category;
        if (title) updateData.title = title;
        if (content) updateData.content = content;
        if (isActive !== undefined) updateData.isActive = isActive;
        updateData.updatedAt = new Date().toISOString();

        const { data: updated, error } = await supabase
            .from('KnowledgeEntry')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Knowledge entry updated', entry: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update knowledge entry' });
    }
});

/**
 * DELETE /api/knowledge/:id — Delete entry
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.auth!.tenantId;
        const id = req.params.id as string;

        const { data: existing } = await supabase
            .from('KnowledgeEntry')
            .select('id')
            .eq('id', id)
            .eq('tenantId', tenantId)
            .single();

        if (!existing) {
            return res.status(404).json({ error: 'Knowledge entry not found' });
        }

        const { error } = await supabase.from('KnowledgeEntry').delete().eq('id', id);
        if (error) throw error;

        res.json({ message: 'Knowledge entry deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete knowledge entry' });
    }
});

export default router;
