// ============================================
// OmniReply AI — Incoming Message Scheduler
// Converts inbound WhatsApp messages into pending reply jobs
// ============================================

import logger from '../utils/logger';
import { schedulePendingReplyForIncomingMessage } from '../automation/pending-replies';

export async function handleIncomingMessage(
    tenantId: string,
    phone: string,
    message: string,
): Promise<void> {
    try {
        const result = await schedulePendingReplyForIncomingMessage({
            tenantId,
            phone,
            message,
        });

        logger.info({
            tenantId,
            phone,
            pendingReplyQueued: Boolean(result.pendingReply),
            sourceType: result.evaluation?.sourceType || 'NONE',
        }, 'Inbound WhatsApp message processed');
    } catch (error) {
        logger.error({ error, tenantId, phone }, 'Inbound WhatsApp scheduling failed');
    }
}
