import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

export type RouteRequestContext = {
    requestId: string;
    routeName: string;
    userId: string | null;
    tenantId: string | null;
};

export function getRouteRequestContext(req: Request, routeName: string): RouteRequestContext {
    const headerRequestId = req.headers['x-request-id'];
    return {
        requestId: typeof headerRequestId === 'string' && headerRequestId.trim() ? headerRequestId : randomUUID(),
        routeName,
        userId: req.auth?.userId || null,
        tenantId: req.auth?.tenantId || null,
    };
}

export function getSafeErrorDetails(error: unknown, fallback = 'Unexpected server error'): string {
    if (error && typeof error === 'object') {
        const candidate = error as {
            code?: string;
            message?: string;
            details?: string;
            issues?: Array<{ message?: string }>;
        };

        if (Array.isArray(candidate.issues) && candidate.issues[0]?.message) {
            return candidate.issues[0].message;
        }

        if (candidate.code && candidate.message) {
            return `${candidate.code}: ${candidate.message}`.slice(0, 240);
        }

        if (candidate.message) {
            return candidate.message.slice(0, 240);
        }

        if (candidate.details) {
            return candidate.details.slice(0, 240);
        }
    }

    return fallback;
}

export function sendRouteError(
    res: Response,
    status: number,
    error: string,
    details: string,
    requestId: string,
) {
    return res.status(status).json({
        error,
        details,
        requestId,
    });
}
