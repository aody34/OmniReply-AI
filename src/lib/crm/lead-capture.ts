// ============================================
// OmniReply AI — CRM Lead Capture (Supabase JS)
// Auto-capture customer contacts
// ============================================

import supabase from '../db';
import logger from '../utils/logger';

/**
 * Extract and store lead from incoming message
 */
export async function captureLeadFromMessage(
    tenantId: string,
    phone: string,
    message: string
): Promise<void> {
    try {
        const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/\D/g, '');

        // Check if lead already exists
        const { data: existing } = await supabase
            .from('Lead')
            .select('*')
            .eq('tenantId', tenantId)
            .eq('phone', cleanPhone)
            .single();

        if (existing) {
            // Update existing lead
            await supabase
                .from('Lead')
                .update({
                    messageCount: (existing.messageCount || 0) + 1,
                    lastContact: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                })
                .eq('id', existing.id);
        } else {
            // Create new lead
            const name = extractNameFromMessage(message);

            await supabase.from('Lead').insert({
                tenantId,
                phone: cleanPhone,
                name,
                firstMessage: message.substring(0, 500),
                messageCount: 1,
                lastContact: new Date().toISOString(),
            });

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
                    .update({ newLeads: (stat.newLeads || 0) + 1 })
                    .eq('id', stat.id);
            }

            logger.info({ tenantId, phone: cleanPhone, name }, '📇 New lead captured');
        }
    } catch (err) {
        logger.error({ error: err, tenantId, phone }, 'Lead capture failed');
    }
}

/**
 * Try to extract a name from the first message
 */
function extractNameFromMessage(message: string): string | null {
    const patterns = [
        /my name is (\w+)/i,
        /i'?m (\w+)/i,
        /this is (\w+)/i,
        /magacayga waa (\w+)/i,  // Somali: "my name is"
        /waxaan ahay (\w+)/i,    // Somali: "I am"
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) return match[1];
    }

    return null;
}
