import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';
import {
    DEFAULT_AUTOMATION_SETTINGS,
    getTenantAutomationSettings,
    tenantAutomationSettingsSchema,
    upsertTenantAutomationSettings,
} from '../lib/automation/settings';
import { getOwnerActivityStatus } from '../lib/automation/owner-activity';
import logger from '../lib/utils/logger';
import { getRouteRequestContext, getSafeErrorDetails, sendRouteError } from '../lib/utils/route-response';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'settings.get');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling automation settings fetch');

        const tenantId = req.auth.tenantId;
        const settings = await getTenantAutomationSettings(tenantId);
        const activity = await getOwnerActivityStatus(tenantId, settings.offlineGraceMinutes);

        res.json({
            settings,
            ownerActivity: activity,
        });
    } catch (error) {
        logger.error({ ...ctx, details: getSafeErrorDetails(error) }, 'Automation settings fetch failed');
        return sendRouteError(res, 500, 'SETTINGS_FETCH_FAILED', getSafeErrorDetails(error, 'Failed to fetch automation settings'), ctx.requestId);
    }
});

router.put('/', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'settings.update');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling automation settings update');

        const tenantId = req.auth.tenantId;
        assertNoTenantOverride(req.body);

        const parsed = tenantAutomationSettingsSchema.parse(req.body);
        const data = await upsertTenantAutomationSettings(tenantId, parsed);

        res.json({
            message: 'Automation settings updated',
            settings: tenantAutomationSettingsSchema.parse(data || DEFAULT_AUTOMATION_SETTINGS),
        });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return sendRouteError(res, 400, 'TENANT_OVERRIDE_BLOCKED', error.message, ctx.requestId);
        }
        const status = typeof error === 'object' && error && 'issues' in error ? 400 : 500;
        const code = status === 400 ? 'SETTINGS_UPDATE_INVALID' : 'SETTINGS_UPDATE_FAILED';
        const details = getSafeErrorDetails(error, 'Failed to update automation settings');
        logger.error({ ...ctx, details }, 'Automation settings update failed');
        return sendRouteError(res, status, code, details, ctx.requestId);
    }
});

export default router;
