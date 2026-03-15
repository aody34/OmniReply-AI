// ============================================
// OmniReply AI — WhatsApp Connection Status Monitor
// Real-time tracking of session states
// ============================================

import { EventEmitter } from 'events';
import { WhatsAppStatus } from '../../types';

class StatusMonitor extends EventEmitter {
    private statuses: Map<string, WhatsAppStatus> = new Map();

    /**
     * Update the status of a tenant's WhatsApp connection
     */
    setStatus(status: WhatsAppStatus): void {
        this.statuses.set(status.tenantId, status);
        this.emit('status_change', status);
        this.emit(`status:${status.tenantId}`, status);
    }

    /**
     * Get current status for a tenant
     */
    getStatus(tenantId: string): WhatsAppStatus {
        return this.statuses.get(tenantId) || {
            tenantId,
            sessionId: null,
            state: 'DISCONNECTED',
            qr: null,
            qrCreatedAt: null,
            reason: null,
            phoneNumber: null,
            updatedAt: new Date(0).toISOString(),
            lastSeenAt: null,
            connectedAt: null,
            disconnectedAt: null,
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
        this.emit(`status:${tenantId}`, this.getStatus(tenantId));
    }

    /**
     * Check if a tenant has an active connection
     */
    isConnected(tenantId: string): boolean {
        const status = this.statuses.get(tenantId);
        return status?.state === 'CONNECTED';
    }
}

// Export singleton
export const statusMonitor = new StatusMonitor();
