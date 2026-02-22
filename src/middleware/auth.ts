// ============================================
// OmniReply AI — JWT Authentication Middleware
// ============================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../lib/utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'omnireply-dev-secret';

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
        }
    }
}

/**
 * Sign a JWT token
 */
export function signToken(payload: AuthPayload): string {
    return jwt.sign(payload as object, JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as jwt.SignOptions);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): AuthPayload {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
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
