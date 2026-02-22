// ============================================
// OmniReply AI — Supabase Client Singleton
// Uses service_role key for full backend access
// ============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const DB_REQUEST_TIMEOUT_MS = parseInt(process.env.DB_REQUEST_TIMEOUT_MS || '10000', 10);
const isDbConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isDbConfigured) {
    console.warn('⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — database features will not work');
}

const timedFetch: typeof fetch = async (input, init = {}) => {
    // Respect caller-provided cancellation signals when present.
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

// Service role client — bypasses RLS, full access for backend
const supabase: SupabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key',
    {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: timedFetch },
    },
);

export { isDbConfigured, DB_REQUEST_TIMEOUT_MS };
export default supabase;
