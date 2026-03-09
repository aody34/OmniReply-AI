// ============================================
// OmniReply AI — Auth Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import supabase, { isDbConfigured } from '../lib/db';
import { signToken, authMiddleware } from '../middleware/auth';
import logger from '../lib/utils/logger';
import { randomUUID } from 'crypto';

const router = Router();

type AuthTables = {
    userTable: string;
    tenantTable: string;
};

const AUTH_TABLE_CANDIDATES: AuthTables[] = [
    { userTable: 'User', tenantTable: 'Tenant' },
    { userTable: 'users', tenantTable: 'tenants' },
];

let resolvedAuthTables: AuthTables | null = null;

function isMissingRelationError(error: any): boolean {
    const message = String(error?.message || '');
    return error?.code === '42P01' || /relation .* does not exist/i.test(message);
}

async function getAuthTables(): Promise<AuthTables> {
    if (resolvedAuthTables) return resolvedAuthTables;

    for (const candidate of AUTH_TABLE_CANDIDATES) {
        const { error } = await supabase.from(candidate.userTable).select('id').limit(1);

        if (!error) {
            resolvedAuthTables = candidate;
            logger.info(candidate, 'Resolved auth table mapping');
            return candidate;
        }

        if (!isMissingRelationError(error)) {
            resolvedAuthTables = candidate;
            logger.warn({ candidate, error }, 'Using auth table mapping despite probe error');
            return candidate;
        }
    }

    resolvedAuthTables = AUTH_TABLE_CANDIDATES[0];
    logger.warn(resolvedAuthTables, 'Falling back to default auth table mapping');
    return resolvedAuthTables;
}

/**
 * POST /api/auth/register
 * Register a new business (creates tenant + owner)
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        if (!isDbConfigured) {
            return res.status(503).json({ error: 'Database is not configured on the backend' });
        }
        const { userTable, tenantTable } = await getAuthTables();

        const { email, password, name, businessName, businessType } = req.body;

        if (!email || !password || !name || !businessName) {
            return res.status(400).json({ error: 'email, password, name, and businessName are required' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }

        // Check if email already exists
        const { data: existing, error: existingError } = await supabase
            .from(userTable)
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Create tenant
        const tenantId = randomUUID();
        const { error: tenantError } = await supabase
            .from(tenantTable)
            .insert({
                id: tenantId,
                name: businessName,
                businessType: businessType || 'general',
            });

        if (tenantError) throw tenantError;

        // Create user
        const userId = randomUUID();
        const { error: userError } = await supabase
            .from(userTable)
            .insert({
                id: userId,
                tenantId,
                email,
                password: hashedPassword,
                name,
                role: 'owner',
            });

        if (userError) throw userError;

        const token = signToken({ userId, tenantId, email, role: 'owner' });

        logger.info({ tenantId, email }, '🏢 New tenant registered');

        res.status(201).json({
            message: 'Registration successful',
            token,
            tenant: { id: tenantId, name: businessName },
            user: { id: userId, email, name, role: 'owner' },
        });
    } catch (err: any) {
        logger.error({ error: err }, 'Registration failed');
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Login with email/password
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        if (!isDbConfigured) {
            return res.status(503).json({ error: 'Database is not configured on the backend' });
        }
        const { userTable } = await getAuthTables();

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const { data: user, error } = await supabase
            .from(userTable)
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = signToken({
            userId: user.id,
            tenantId: user.tenantId,
            email: user.email,
            role: user.role,
        });

        logger.info({ email, tenantId: user.tenantId }, '🔐 User logged in');

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    } catch (err: any) {
        logger.error({ error: err }, 'Login failed');
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
        if (!isDbConfigured) {
            return res.status(503).json({ error: 'Database is not configured on the backend' });
        }
        const { userTable, tenantTable } = await getAuthTables();

        const { data: user } = await supabase
            .from(userTable)
            .select('id, email, name, role, tenantId, createdAt')
            .eq('id', req.auth!.userId)
            .eq('tenantId', req.auth!.tenantId)
            .maybeSingle();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { data: tenant } = await supabase
            .from(tenantTable)
            .select('*')
            .eq('id', req.auth!.tenantId)
            .single();

        res.json({ user, tenant });
    } catch (err: any) {
        logger.error({ error: err }, 'Profile fetch failed');
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

export default router;
