import { describe, expect, it } from 'vitest';
import {
    buildNextWhatsAppStatus,
    createDefaultWhatsAppStatus,
} from '../../src/lib/whatsapp/session-state';

describe('WhatsApp session state machine', () => {
    it('clears qr when transitioning from QR to CONNECTED', () => {
        const initial = buildNextWhatsAppStatus(
            createDefaultWhatsAppStatus('tenant-1'),
            {
                state: 'QR',
                qr: 'qr-payload',
                updatedAt: '2026-03-15T10:00:00.000Z',
            },
        );

        const next = buildNextWhatsAppStatus(initial, {
            state: 'CONNECTED',
            phoneNumber: '252612345678',
            updatedAt: '2026-03-15T10:01:00.000Z',
        });

        expect(initial.qrCreatedAt).toBe('2026-03-15T10:00:00.000Z');
        expect(next.state).toBe('CONNECTED');
        expect(next.qr).toBeNull();
        expect(next.qrCreatedAt).toBeNull();
        expect(next.phoneNumber).toBe('252612345678');
        expect(next.connectedAt).toBe('2026-03-15T10:01:00.000Z');
    });

    it('clears qr when transitioning from CONNECTED to DISCONNECTED', () => {
        const connected = buildNextWhatsAppStatus(
            createDefaultWhatsAppStatus('tenant-1'),
            {
                state: 'CONNECTED',
                phoneNumber: '252612345678',
                updatedAt: '2026-03-15T10:00:00.000Z',
            },
        );

        const next = buildNextWhatsAppStatus(connected, {
            state: 'DISCONNECTED',
            reason: 'Disconnected by user.',
            updatedAt: '2026-03-15T10:02:00.000Z',
        });

        expect(next.state).toBe('DISCONNECTED');
        expect(next.qr).toBeNull();
        expect(next.reason).toBe('Disconnected by user.');
        expect(next.disconnectedAt).toBe('2026-03-15T10:02:00.000Z');
    });
});
