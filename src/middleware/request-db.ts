import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { createTenantScopedClient, RequestDbConfigurationError } from '../lib/request-db';
import logger from '../lib/utils/logger';

declare global {
    namespace Express {
        interface Request {
            tenantDb?: SupabaseClient;
        }
    }
}

export function requestDbMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.auth) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        req.tenantDb = createTenantScopedClient(req.auth);
        next();
    } catch (error) {
        if (error instanceof RequestDbConfigurationError) {
            logger.error({ tenantId: req.auth.tenantId }, 'Tenant-scoped database access is not configured');
            res.status(503).json({ error: error.message });
            return;
        }

        logger.error({ error, tenantId: req.auth.tenantId }, 'Failed to initialize tenant-scoped database access');
        res.status(500).json({ error: 'Failed to initialize tenant-scoped database access' });
    }
}
