// ============================================
// OmniReply AI — Amniga Anti-Ban Suite (Supabase JS)
// Human-mimicry, rate limiting, and override detection
// ============================================

import supabase from '../db';
import logger from '../utils/logger';
import type { WASocket } from '@whiskeysockets/baileys';

// ── Human Override Tracking ──
const humanOverrides: Map<string, number> = new Map(); // key: tenantId:chatJid, value: timestamp
const OVERRIDE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Mark a chat as human-overridden (owner replied manually)
 */
export function activateHumanOverride(tenantId: string, chatJid: string): void {
    const key = `${tenantId}:${chatJid}`;
    humanOverrides.set(key, Date.now());
    logger.info({ tenantId, chatJid }, '👤 Human override activated (30 min)');
}

/**
 * Check if human override is active for a chat
 */
export function isHumanOverrideActive(tenantId: string, chatJid: string): boolean {
    const key = `${tenantId}:${chatJid}`;
    const timestamp = humanOverrides.get(key);

    if (!timestamp) return false;

    if (Date.now() - timestamp > OVERRIDE_DURATION) {
        humanOverrides.delete(key);
        return false;
    }

    return true;
}

// ── Rate Limiter ──

/**
 * Check if tenant is within daily message limit
 */
export async function checkRateLimit(tenantId: string): Promise<boolean> {
    try {
        // Get tenant's daily limit
        const { data: tenant } = await supabase
            .from('Tenant')
            .select('maxDailyMessages')
            .eq('id', tenantId)
            .single();

        if (!tenant) return false;

        const today = new Date().toISOString().split('T')[0];

        // Get today's outbound count
        const { data: stat } = await supabase
            .from('DailyStat')
            .select('messagesOut')
            .eq('tenantId', tenantId)
            .eq('date', today)
            .single();

        const sent = stat?.messagesOut || 0;
        const limit = tenant.maxDailyMessages || 100;

        if (sent >= limit) {
            logger.warn({ tenantId, sent, limit }, '⚠️ Daily rate limit reached');
            return false;
        }

        return true;
    } catch (err) {
        logger.error({ error: err, tenantId }, 'Rate limit check failed');
        return true; // Fail open
    }
}

// ── Human Mimicry ──

/**
 * Simulate human-like typing and delay before sending
 */
export async function humanMimicry(socket: WASocket, chatJid: string): Promise<void> {
    try {
        // Random "composing" duration: 3-7 seconds
        const typingDuration = 3000 + Math.random() * 4000;

        // Send composing indicator
        await socket.presenceSubscribe(chatJid);
        await socket.sendPresenceUpdate('composing', chatJid);

        // Wait while "typing"
        await new Promise(resolve => setTimeout(resolve, typingDuration));

        // Stop composing
        await socket.sendPresenceUpdate('paused', chatJid);

        // Additional random delay: 0.5-2 seconds
        const postDelay = 500 + Math.random() * 1500;
        await new Promise(resolve => setTimeout(resolve, postDelay));
    } catch (err) {
        // Non-critical — continue even if presence fails
        logger.debug({ error: err, chatJid }, 'Presence update failed (non-critical)');
    }
}
