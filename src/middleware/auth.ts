// ============================================
// OmniReply AI — JWT Authentication Middleware
// ============================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../lib/utils/logger';

const rawJwtSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === 'production' && !rawJwtSecret) {
    throw new Error('JWT_SECRET must be configured in production');
}

const JWT_SECRET = rawJwtSecret || 'omnireply-dev-secret';

export interface AuthPayload {
    userId: string;
    tenantId: string;
    email: string;
    role: string;
}

// Extend Express Request to include auth payload
declare global {
    namespace Express {
        interface Request {
            auth?: AuthPayload;
            user?: AuthPayload;
        }
    }
}

function isValidAuthPayload(payload: unknown): payload is AuthPayload {
    if (!payload || typeof payload !== 'object') return false;
    const candidate = payload as Partial<AuthPayload>;
    return Boolean(
        typeof candidate.userId === 'string' &&
        candidate.userId &&
        typeof candidate.tenantId === 'string' &&
        candidate.tenantId &&
        typeof candidate.email === 'string' &&
        candidate.email &&
        typeof candidate.role === 'string' &&
        candidate.role,
    );
}

/**
 * Sign a JWT token
 */
export function signToken(payload: AuthPayload): string {
    if (!isValidAuthPayload(payload)) {
        throw new Error('Cannot sign JWT with invalid auth payload');
    }

    return jwt.sign(payload as object, JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        algorithm: 'HS256',
    } as jwt.SignOptions);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): AuthPayload {
    const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
    });

    if (!isValidAuthPayload(decoded)) {
        throw new Error('Invalid JWT payload');
    }

    return decoded;
}

/**
 * Auth middleware — validates JWT from Authorization header
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = verifyToken(token);
        req.auth = payload;
        req.user = payload;
        next();
    } catch (err) {
        logger.warn({ error: err }, 'Invalid JWT token');
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Role check middleware — ensures user has the required role
 */
export function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.auth) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        if (!roles.includes(req.auth.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
}
