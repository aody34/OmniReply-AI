// ============================================
// OmniReply AI — Auth Routes (Supabase JS)
// ============================================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import supabase from '../lib/db';
import { signToken, authMiddleware } from '../middleware/auth';
import logger from '../lib/utils/logger';
import { v4 as uuid } from 'uuid';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new business (creates tenant + owner)
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name, businessName, businessType } = req.body;

        if (!email || !password || !name || !businessName) {
            return res.status(400).json({ error: 'email, password, name, and businessName are required' });
        }

        // Check if email already exists
        const { data: existing } = await supabase
            .from('User')
            .select('id')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Create tenant
        const tenantId = uuid();
        const { error: tenantError } = await supabase
            .from('Tenant')
            .insert({
                id: tenantId,
                name: businessName,
                businessType: businessType || 'general',
            });

        if (tenantError) throw tenantError;

        // Create user
        const userId = uuid();
        const { error: userError } = await supabase
            .from('User')
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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const { data: user, error } = await supabase
            .from('User')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
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
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { data: user } = await supabase
            .from('User')
            .select('id, email, name, role, tenantId, createdAt')
            .eq('id', req.auth!.userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { data: tenant } = await supabase
            .from('Tenant')
            .select('*')
            .eq('id', req.auth!.tenantId)
            .single();

        res.json({ user, tenant });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

export default router;
