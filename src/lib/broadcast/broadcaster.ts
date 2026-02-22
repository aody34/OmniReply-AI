// ============================================
// OmniReply AI — Broadcast Module (Supabase JS)
// Controlled bulk messaging with anti-ban delays
// ============================================

import supabase from '../db';
import logger from '../utils/logger';
import { checkRateLimit, humanMimicry } from '../amniga/anti-ban';
import { getActiveSocket } from '../whatsapp/connector';

/**
 * Execute a broadcast campaign
 */
export async function executeBroadcast(broadcastId: string): Promise<void> {
    // Get broadcast details
    const { data: broadcast, error } = await supabase
        .from('Broadcast')
        .select('*')
        .eq('id', broadcastId)
        .single();

    if (error || !broadcast) {
        logger.error({ broadcastId }, 'Broadcast not found');
        return;
    }

    const tenantId = broadcast.tenantId;
    const socket = getActiveSocket(tenantId);

    if (!socket) {
        await supabase
            .from('Broadcast')
            .update({ status: 'failed' })
            .eq('id', broadcastId);
        logger.error({ tenantId, broadcastId }, 'No active WhatsApp session for broadcast');
        return;
    }

    // Update status to 'sending'
    await supabase.from('Broadcast').update({ status: 'sending' }).eq('id', broadcastId);

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of broadcast.recipients) {
        try {
            // Check rate limit
            const withinLimit = await checkRateLimit(tenantId);
            if (!withinLimit) {
                logger.warn({ tenantId, broadcastId }, '⚠️ Rate limit reached during broadcast');
                break;
            }

            const jid = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`;

            // Anti-ban delay
            await humanMimicry(socket, jid);

            // Send message
            await socket.sendMessage(jid, { text: broadcast.message });

            // Log outbound
            await supabase.from('MessageLog').insert({
                tenantId,
                direction: 'outbound',
                phone: recipient,
                message: broadcast.message,
            });

            sentCount++;

            // Random delay between recipients (15-45 seconds)
            const delay = 15000 + Math.random() * 30000;
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (err) {
            failedCount++;
            logger.error({ error: err, recipient, broadcastId }, 'Failed to send to recipient');
        }
    }

    // Update broadcast results
    await supabase
        .from('Broadcast')
        .update({
            sentCount,
            failedCount,
            status: 'completed',
            completedAt: new Date().toISOString(),
        })
        .eq('id', broadcastId);

    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    const { data: stat } = await supabase
        .from('DailyStat')
        .select('*')
        .eq('tenantId', tenantId)
        .eq('date', today)
        .single();

    if (stat) {
        await supabase
            .from('DailyStat')
            .update({
                messagesOut: (stat.messagesOut || 0) + sentCount,
                broadcastsSent: (stat.broadcastsSent || 0) + sentCount,
            })
            .eq('id', stat.id);
    }

    logger.info({ tenantId, broadcastId, sentCount, failedCount }, '📢 Broadcast completed');
}
