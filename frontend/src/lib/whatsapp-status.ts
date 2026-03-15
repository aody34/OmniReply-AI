import type { WhatsAppStatusPayload } from './api';

export function isStatusNewer(current: WhatsAppStatusPayload | null, next: WhatsAppStatusPayload): boolean {
    if (!current) {
        return true;
    }
    return Date.parse(next.updatedAt) >= Date.parse(current.updatedAt);
}

export function shouldAcceptStatusResponse(input: {
    current: WhatsAppStatusPayload | null;
    next: WhatsAppStatusPayload;
    requestId: number;
    latestAppliedRequestId: number;
}): boolean {
    if (input.requestId < input.latestAppliedRequestId) {
        return false;
    }
    return isStatusNewer(input.current, input.next);
}

export function getWhatsAppStatusView(status: WhatsAppStatusPayload | null) {
    return {
        isConnected: status?.state === 'CONNECTED',
        isConnecting: status?.state === 'CONNECTING',
        isQrReady: status?.state === 'QR' && Boolean(status?.qr),
        isDisconnected: !status || status.state === 'DISCONNECTED',
        isError: status?.state === 'ERROR',
    };
}

export function formatWhatsAppState(state: WhatsAppStatusPayload['state'] | undefined): string {
    switch (state) {
        case 'CONNECTED':
            return 'Connected';
        case 'CONNECTING':
            return 'Connecting';
        case 'QR':
            return 'Waiting for QR scan';
        case 'ERROR':
            return 'Needs attention';
        case 'DISCONNECTED':
        default:
            return 'Disconnected';
    }
}
