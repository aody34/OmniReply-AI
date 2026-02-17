// ============================================
// OmniReply AI — Supabase Client Singleton
// Uses service_role key for full backend access
// ============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — database features will not work');
}

// Service role client — bypasses RLS, full access for backend
const supabase: SupabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key',
    { auth: { persistSession: false, autoRefreshToken: false } },
);

export default supabase;
