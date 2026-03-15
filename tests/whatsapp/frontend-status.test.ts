import { describe, expect, it } from 'vitest';
import {
    getWhatsAppStatusView,
    shouldShowDisconnect,
    shouldAcceptStatusResponse,
    shouldShowRetry,
} from '../../frontend/src/lib/whatsapp-status';
import type { WhatsAppStatusPayload } from '../../frontend/src/lib/api';

function makeStatus(partial: Partial<WhatsAppStatusPayload>): WhatsAppStatusPayload {
    return {
        tenantId: 'tenant-1',
        sessionId: 'tenant-1:primary',
        state: 'DISCONNECTED',
        qr: null,
        qrCreatedAt: null,
        reason: null,
        phoneNumber: null,
        updatedAt: '2026-03-15T10:00:00.000Z',
        lastSeenAt: null,
        connectedAt: null,
        disconnectedAt: null,
        serverTime: '2026-03-15T10:00:00.000Z',
        ...partial,
    };
}

describe('WhatsApp frontend status helpers', () => {
    it('rejects an out-of-order older poll response', () => {
        const current = makeStatus({
            state: 'CONNECTED',
            updatedAt: '2026-03-15T10:02:00.000Z',
        });
        const older = makeStatus({
            state: 'QR',
            qr: 'stale-qr',
            updatedAt: '2026-03-15T10:01:00.000Z',
        });

        expect(shouldAcceptStatusResponse({
            current,
            next: older,
            requestId: 3,
            latestAppliedRequestId: 3,
        })).toBe(false);
    });

    it('shows QR only when the canonical state is QR and a qr payload exists', () => {
        expect(getWhatsAppStatusView(makeStatus({
            state: 'QR',
            qr: 'fresh-qr',
        })).isQrReady).toBe(true);

        expect(getWhatsAppStatusView(makeStatus({
            state: 'CONNECTED',
            qr: 'should-not-render',
        })).isQrReady).toBe(false);
    });

    it('shows disconnect only for QR or CONNECTED states', () => {
        expect(shouldShowDisconnect(makeStatus({ state: 'CONNECTED' }))).toBe(true);
        expect(shouldShowDisconnect(makeStatus({ state: 'QR', qr: 'fresh-qr' }))).toBe(true);
        expect(shouldShowDisconnect(makeStatus({ state: 'CONNECTING' }))).toBe(false);
    });

    it('shows retry after waiting too long without a qr payload', () => {
        expect(shouldShowRetry(
            makeStatus({ state: 'CONNECTING' }),
            0,
            11_000,
        )).toBe(true);

        expect(shouldShowRetry(
            makeStatus({ state: 'QR', qr: null }),
            0,
            11_000,
        )).toBe(true);
    });
});
