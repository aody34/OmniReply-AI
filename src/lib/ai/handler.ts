// ============================================
// OmniReply AI — Core AI Message Handler (Supabase JS)
// Orchestrates the full message pipeline
// ============================================

import supabase from '../db';
import logger from '../utils/logger';
import { detectLanguage, getLanguageInstruction } from '../utils/language';
import { queryKnowledgeBase } from './rag';
import { generateResponse } from './providers';
import { humanMimicry, checkRateLimit, isHumanOverrideActive } from '../amniga/anti-ban';
import { captureLeadFromMessage } from '../crm/lead-capture';
import type { WASocket } from '@whiskeysockets/baileys';

/**
 * Handle an incoming WhatsApp message — full pipeline
 */
export async function handleIncomingMessage(
    tenantId: string,
    phone: string,
    message: string,
    socket: WASocket
): Promise<void> {
    const chatJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

    try {
        // Step 1: Log inbound message
        await supabase.from('MessageLog').insert({
            tenantId,
            direction: 'inbound',
            phone,
            message,
        });

        // Step 2: Update daily stats (messagesIn)
        await upsertDailyStat(tenantId, { messagesIn: 1 });

        // Step 3: Capture lead
        await captureLeadFromMessage(tenantId, phone, message);

        // Step 4: Check human override
        if (isHumanOverrideActive(tenantId, chatJid)) {
            logger.info({ tenantId, phone }, '👤 Human override active — skipping AI');
            return;
        }

        // Step 5: Check rate limit
        const withinLimit = await checkRateLimit(tenantId);
        if (!withinLimit) {
            logger.warn({ tenantId, phone }, '⚠️ Daily message limit reached');
            return;
        }

        // Step 6: Detect language
        const language = detectLanguage(message);
        const langInstructions = getLanguageInstruction(language);

        // Step 7: Get tenant info
        const { data: tenant } = await supabase
            .from('Tenant')
            .select('*')
            .eq('id', tenantId)
            .single();

        if (!tenant || !tenant.isActive) {
            logger.warn({ tenantId }, '⚠️ Tenant inactive — skipping AI');
            return;
        }

        // Step 8: RAG — query knowledge base
        const { context, sources } = await queryKnowledgeBase(tenantId, message);

        // Step 9: Generate AI response
        const aiResponse = await generateResponse(
            message,
            tenant.name,
            tenant.businessType || 'general',
            context,
            langInstructions,
            sources,
        );

        // Step 10: Anti-ban mimicry + send
        await humanMimicry(socket, chatJid);

        await socket.sendMessage(chatJid, { text: aiResponse.content });

        // Step 11: Log outbound message
        await supabase.from('MessageLog').insert({
            tenantId,
            direction: 'outbound',
            phone,
            message: aiResponse.content,
            language,
            aiModel: 'gemini-pro',
        });

        // Step 12: Update daily stats
        await upsertDailyStat(tenantId, { messagesOut: 1, aiResponses: 1 });

        logger.info(
            { tenantId, phone, language, sources, responseLength: aiResponse.content.length },
            '🤖 AI response sent'
        );
    } catch (err) {
        logger.error({ error: err, tenantId, phone }, '❌ Message handling failed');
    }
}

/**
 * Helper: Upsert daily stats (increment counters)
 */
async function upsertDailyStat(
    tenantId: string,
    increments: { messagesIn?: number; messagesOut?: number; aiResponses?: number; newLeads?: number; broadcastsSent?: number }
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Check if daily stat exists
    const { data: existing } = await supabase
        .from('DailyStat')
        .select('*')
        .eq('tenantId', tenantId)
        .eq('date', today)
        .single();

    if (existing) {
        // Update existing
        const update: any = {};
        if (increments.messagesIn) update.messagesIn = (existing.messagesIn || 0) + increments.messagesIn;
        if (increments.messagesOut) update.messagesOut = (existing.messagesOut || 0) + increments.messagesOut;
        if (increments.aiResponses) update.aiResponses = (existing.aiResponses || 0) + increments.aiResponses;
        if (increments.newLeads) update.newLeads = (existing.newLeads || 0) + increments.newLeads;
        if (increments.broadcastsSent) update.broadcastsSent = (existing.broadcastsSent || 0) + increments.broadcastsSent;

        await supabase
            .from('DailyStat')
            .update(update)
            .eq('id', existing.id);
    } else {
        // Create new daily stat
        await supabase.from('DailyStat').insert({
            tenantId,
            date: today,
            messagesIn: increments.messagesIn || 0,
            messagesOut: increments.messagesOut || 0,
            aiResponses: increments.aiResponses || 0,
            newLeads: increments.newLeads || 0,
            broadcastsSent: increments.broadcastsSent || 0,
        });
    }
}

export { upsertDailyStat };
