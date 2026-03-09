import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import type { AuthPayload } from '../middleware/auth';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET || '';
const DB_REQUEST_TIMEOUT_MS = parseInt(process.env.DB_REQUEST_TIMEOUT_MS || '10000', 10);

export const isRequestDbConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseJwtSecret);

export class RequestDbConfigurationError extends Error {
    constructor(message = 'Secure tenant database access is not configured on the backend') {
        super(message);
        this.name = 'RequestDbConfigurationError';
    }
}

export class TenantOverrideError extends Error {
    constructor(message = 'tenantId must be derived from the authenticated session') {
        super(message);
        this.name = 'TenantOverrideError';
    }
}

const timedFetch: typeof fetch = async (input, init = {}) => {
    if (init.signal) {
        return fetch(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DB_REQUEST_TIMEOUT_MS);

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

function buildSupabaseAccessToken(auth: AuthPayload): string {
    if (!supabaseJwtSecret) {
        throw new RequestDbConfigurationError();
    }

    return jwt.sign(
        {
            aud: 'authenticated',
            sub: auth.userId,
            email: auth.email,
            role: 'authenticated',
            tenantId: auth.tenantId,
            appRole: auth.role,
        },
        supabaseJwtSecret,
        {
            algorithm: 'HS256',
            expiresIn: '5m',
        },
    );
}

export function createTenantScopedClient(auth: AuthPayload): SupabaseClient {
    if (!isRequestDbConfigured) {
        throw new RequestDbConfigurationError();
    }

    const accessToken = buildSupabaseAccessToken(auth);

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
            fetch: timedFetch,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    });
}

export function assertNoTenantOverride(payload: unknown): void {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'tenantId')) {
        throw new TenantOverrideError();
    }
}
