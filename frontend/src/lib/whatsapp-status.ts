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
        isConnecting: status?.state === 'CONNECTING' || status?.state === 'QR',
        isQrReady: status?.state === 'QR' && Boolean(status?.qr),
        isDisconnected: !status || status.state === 'DISCONNECTED',
        isError: status?.state === 'ERROR',
    };
}

export function shouldShowDisconnect(status: WhatsAppStatusPayload | null): boolean {
    return status?.state === 'QR' || status?.state === 'CONNECTED';
}

export function shouldShowRetry(
    status: WhatsAppStatusPayload | null,
    waitingSinceMs: number | null,
    nowMs = Date.now(),
): boolean {
    if (!status || waitingSinceMs === null) {
        return false;
    }

    if (status.state !== 'CONNECTING' && !(status.state === 'QR' && !status.qr)) {
        return false;
    }

    return nowMs - waitingSinceMs >= 10_000;
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
