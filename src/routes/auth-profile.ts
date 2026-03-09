import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requestDbMiddleware } from '../middleware/request-db';
import { resolveAuthTables } from '../lib/auth-tables';
import logger from '../lib/utils/logger';

const router = Router();

router.use(authMiddleware);
router.use(requestDbMiddleware);

router.get('/me', async (req: Request, res: Response) => {
    try {
        const db = req.tenantDb!;
        const { userTable, tenantTable } = await resolveAuthTables(db);

        const { data: user, error: userError } = await db
            .from(userTable)
            .select('id, email, name, role, tenantId, createdAt')
            .eq('id', req.auth!.userId)
            .eq('tenantId', req.auth!.tenantId)
            .maybeSingle();

        if (userError) throw userError;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { data: tenant, error: tenantError } = await db
            .from(tenantTable)
            .select('*')
            .eq('id', req.auth!.tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ user, tenant });
    } catch (err) {
        logger.error({ error: err, tenantId: req.auth?.tenantId }, 'Profile fetch failed');
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

export default router;
