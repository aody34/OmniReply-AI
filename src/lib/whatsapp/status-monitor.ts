// ============================================
// OmniReply AI — WhatsApp Connection Status Monitor
// Real-time tracking of session states
// ============================================

import { EventEmitter } from 'events';
import { WhatsAppStatus } from '../../types';
import logger from '../utils/logger';

class StatusMonitor extends EventEmitter {
    private statuses: Map<string, WhatsAppStatus> = new Map();

    /**
     * Update the status of a tenant's WhatsApp connection
     */
    updateStatus(tenantId: string, update: Partial<WhatsAppStatus>): void {
        const current = this.statuses.get(tenantId) || {
            tenantId,
            status: 'disconnected' as const,
        };

        const updated: WhatsAppStatus = { ...current, ...update, tenantId };
        this.statuses.set(tenantId, updated);

        logger.info({ tenantId, status: updated.status }, 'WhatsApp status updated');
        this.emit('status_change', updated);
        this.emit(`status:${tenantId}`, updated);
    }

    /**
     * Get current status for a tenant
     */
    getStatus(tenantId: string): WhatsAppStatus {
        return this.statuses.get(tenantId) || {
            tenantId,
            status: 'disconnected',
        };
    }

    /**
     * Get all active statuses
     */
    getAllStatuses(): WhatsAppStatus[] {
        return Array.from(this.statuses.values());
    }

    /**
     * Remove a tenant's status tracking
     */
    removeStatus(tenantId: string): void {
        this.statuses.delete(tenantId);
        this.emit(`status:${tenantId}`, { tenantId, status: 'disconnected' });
    }

    /**
     * Check if a tenant has an active connection
     */
    isConnected(tenantId: string): boolean {
        const status = this.statuses.get(tenantId);
        return status?.status === 'connected';
    }
}

// Export singleton
export const statusMonitor = new StatusMonitor();
