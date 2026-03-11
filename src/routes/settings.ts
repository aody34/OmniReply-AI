import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { requestDbMiddleware } from '../middleware/request-db';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';
import {
    DEFAULT_AUTOMATION_SETTINGS,
    tenantAutomationSettingsSchema,
} from '../lib/automation/settings';
import { getOwnerActivityStatus } from '../lib/automation/owner-activity';

const router = Router();

router.use(authMiddleware);
router.use(requestDbMiddleware);

router.get('/', async (req: Request, res: Response) => {
    try {
        const db = req.tenantDb!;
        const tenantId = req.auth!.tenantId;
        const { data, error } = await db
            .from('TenantAutomationSettings')
            .select('*')
            .eq('tenantId', tenantId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        const settings = data
            ? tenantAutomationSettingsSchema.parse(data)
            : DEFAULT_AUTOMATION_SETTINGS;
        const activity = await getOwnerActivityStatus(tenantId, settings.offlineGraceMinutes);

        res.json({
            settings,
            ownerActivity: activity,
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch automation settings' });
    }
});

router.put('/', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const db = req.tenantDb!;
        const tenantId = req.auth!.tenantId;
        assertNoTenantOverride(req.body);

        const parsed = tenantAutomationSettingsSchema.parse(req.body);
        const { data, error } = await db
            .from('TenantAutomationSettings')
            .upsert({
                tenantId,
                ...parsed,
                updatedAt: new Date().toISOString(),
            }, { onConflict: 'tenantId' })
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        res.json({
            message: 'Automation settings updated',
            settings: tenantAutomationSettingsSchema.parse(data),
        });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Failed to update automation settings' });
    }
});

export default router;
