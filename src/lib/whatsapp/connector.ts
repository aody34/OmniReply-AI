// ============================================
// OmniReply AI — WhatsApp Multi-Session Connector (Supabase JS)
// Manages concurrent Baileys connections per tenant
// ============================================

import makeWASocket, {
    DisconnectReason,
    WASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import logger from '../utils/logger';
import { sessionStore } from './session-store';
import { handleIncomingMessage } from '../ai/handler';
import { getTenantAutomationSettings } from '../automation/settings';
import {
    cancelPendingRepliesForPhone,
    normalizePhoneIdentifier,
    setLeadHumanOverride,
} from '../automation/pending-replies';
import { recordTenantManualReplyActivity } from '../automation/owner-activity';
import { getCanonicalWhatsAppStatus, setCanonicalWhatsAppState } from './session-state';

const liveSockets: Map<string, WASocket> = new Map();
const activeSockets: Map<string, WASocket> = new Map();
const pendingConnections: Map<string, Promise<void>> = new Map();
const reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
const manualDisconnects: Set<string> = new Set();

function clearReconnectTimer(tenantId: string): void {
    const timer = reconnectTimers.get(tenantId);
    if (timer) {
        clearTimeout(timer);
        reconnectTimers.delete(tenantId);
    }
}

function scheduleReconnect(tenantId: string): void {
    clearReconnectTimer(tenantId);
    const timer = setTimeout(() => {
        reconnectTimers.delete(tenantId);
        connectSession(tenantId).catch((error) => {
            logger.error({ error, tenantId }, 'WhatsApp reconnect attempt failed');
        });
    }, 5000);
    reconnectTimers.set(tenantId, timer);
}

function isAuthFailure(statusCode?: number): boolean {
    return [
        DisconnectReason.badSession,
        DisconnectReason.connectionReplaced,
        DisconnectReason.loggedOut,
        DisconnectReason.multideviceMismatch,
    ].includes(statusCode as DisconnectReason);
}

function getDisconnectReason(statusCode?: number): string {
    switch (statusCode) {
        case DisconnectReason.badSession:
            return 'Authentication failed. Please reconnect your WhatsApp session.';
        case DisconnectReason.connectionClosed:
        case DisconnectReason.connectionLost:
        case DisconnectReason.restartRequired:
        case DisconnectReason.timedOut:
            return 'Temporary WhatsApp login issue. Retrying connection.';
        case DisconnectReason.connectionReplaced:
            return 'Your WhatsApp session was replaced by another login. Please reconnect.';
        case DisconnectReason.loggedOut:
            return 'Your WhatsApp session expired. Click Connect to generate a new QR code.';
        case DisconnectReason.multideviceMismatch:
            return 'WhatsApp linked-device sync failed. Please reconnect.';
        default:
            return 'Temporary WhatsApp login issue. Please try connecting again.';
    }
}

async function markConnected(tenantId: string, socket: WASocket): Promise<void> {
    const phoneNumber = socket.user?.id?.split(':')[0] || null;
    await setCanonicalWhatsAppState(tenantId, {
        state: 'CONNECTED',
        phoneNumber,
        reason: null,
    });
    activeSockets.set(tenantId, socket);
    logger.info({ tenantId, phoneNumber }, 'WhatsApp connected');
}

async function handleSocketClose(tenantId: string, lastDisconnect: unknown): Promise<void> {
    liveSockets.delete(tenantId);
    activeSockets.delete(tenantId);

    const statusCode = (lastDisconnect as Boom | undefined)?.output?.statusCode;

    if (manualDisconnects.has(tenantId)) {
        manualDisconnects.delete(tenantId);
        clearReconnectTimer(tenantId);
        await setCanonicalWhatsAppState(tenantId, {
            state: 'DISCONNECTED',
            reason: 'Disconnected by user.',
        });
        return;
    }

    if (statusCode === DisconnectReason.loggedOut) {
        clearReconnectTimer(tenantId);
        await sessionStore.deleteSession(tenantId);
        await setCanonicalWhatsAppState(tenantId, {
            state: 'DISCONNECTED',
            reason: getDisconnectReason(statusCode),
        });
        return;
    }

    if (isAuthFailure(statusCode)) {
        clearReconnectTimer(tenantId);
        await sessionStore.deleteSession(tenantId);
        await setCanonicalWhatsAppState(tenantId, {
            state: 'ERROR',
            reason: getDisconnectReason(statusCode),
        });
        return;
    }

    await setCanonicalWhatsAppState(tenantId, {
        state: 'CONNECTING',
        reason: getDisconnectReason(statusCode),
    });
    scheduleReconnect(tenantId);
}

/**
 * Get the active socket for a tenant.
 * Only fully connected sockets are returned here because broadcast sends require an open session.
 */
export function getActiveSocket(tenantId: string): WASocket | null {
    return activeSockets.get(tenantId) || null;
}

/**
 * Connect a WhatsApp session for a tenant.
 */
export async function connectSession(tenantId: string): Promise<void> {
    if (liveSockets.has(tenantId)) {
        logger.info({ tenantId }, 'WhatsApp session already starting or active');
        return;
    }

    const pending = pendingConnections.get(tenantId);
    if (pending) {
        await pending;
        return;
    }

    const connectionPromise = (async () => {
        manualDisconnects.delete(tenantId);
        clearReconnectTimer(tenantId);

        const current = await getCanonicalWhatsAppStatus(tenantId).catch(() => null);
        if (current?.state === 'CONNECTED' && activeSockets.has(tenantId)) {
            return;
        }

        await setCanonicalWhatsAppState(tenantId, {
            state: 'CONNECTING',
            reason: null,
        });

        const { state, saveCreds } = await sessionStore.getAuthState(tenantId);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger as any),
            },
            printQRInTerminal: false,
            logger: logger as any,
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: true,
        });

        liveSockets.set(tenantId, socket);

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            try {
                if (qr) {
                    await setCanonicalWhatsAppState(tenantId, {
                        state: 'QR',
                        qr,
                        reason: null,
                    });
                    logger.info({ tenantId }, 'WhatsApp QR generated');
                }

                if (connection === 'connecting') {
                    await setCanonicalWhatsAppState(tenantId, {
                        state: 'CONNECTING',
                        reason: null,
                    });
                }

                if (connection === 'open') {
                    clearReconnectTimer(tenantId);
                    await markConnected(tenantId, socket);
                }

                if (connection === 'close') {
                    await handleSocketClose(tenantId, lastDisconnect?.error);
                }
            } catch (error) {
                logger.error({ error, tenantId }, 'Failed to process WhatsApp connection update');
                await setCanonicalWhatsAppState(tenantId, {
                    state: 'ERROR',
                    reason: 'Temporary WhatsApp login issue. Please try connecting again.',
                }).catch(() => undefined);
            }
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.remoteJid === 'status@broadcast') continue;

                const phone = normalizePhoneIdentifier(msg.key.remoteJid || '');
                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    '';

                if (!phone) continue;

                if (msg.key.fromMe) {
                    try {
                        const settings = await getTenantAutomationSettings(tenantId);
                        await recordTenantManualReplyActivity(tenantId);
                        await cancelPendingRepliesForPhone(tenantId, phone, 'manual_reply_detected');
                        if (settings.enableHumanOverride) {
                            await setLeadHumanOverride(tenantId, phone, settings.humanOverrideMinutes);
                        }
                    } catch (error) {
                        logger.error({ error, tenantId, phone }, 'Failed to register manual WhatsApp reply activity');
                    }
                    continue;
                }

                if (!text) continue;

                await handleIncomingMessage(tenantId, phone, text);
            }
        });
    })()
        .catch(async (error) => {
            logger.error({ error, tenantId }, 'Failed to initialize WhatsApp session');
            await setCanonicalWhatsAppState(tenantId, {
                state: 'ERROR',
                reason: 'Temporary WhatsApp login issue. Please try connecting again.',
            }).catch(() => undefined);
            throw error;
        })
        .finally(() => {
            pendingConnections.delete(tenantId);
        });

    pendingConnections.set(tenantId, connectionPromise);
    await connectionPromise;
}

/**
 * Disconnect a WhatsApp session.
 */
export async function disconnectSession(tenantId: string): Promise<void> {
    manualDisconnects.add(tenantId);
    clearReconnectTimer(tenantId);

    const socket = liveSockets.get(tenantId) || activeSockets.get(tenantId);
    if (socket) {
        try {
            await socket.logout();
        } catch (error) {
            logger.warn({ error, tenantId }, 'WhatsApp logout raised an error during manual disconnect');
        }
    }

    liveSockets.delete(tenantId);
    activeSockets.delete(tenantId);
    await sessionStore.deleteSession(tenantId);
    await setCanonicalWhatsAppState(tenantId, {
        state: 'DISCONNECTED',
        reason: 'Disconnected by user.',
    });
}

/**
 * Reconnect all existing sessions on server startup.
 */
export async function reconnectAllSessions(): Promise<void> {
    try {
        const supabase = (await import('../db')).default;
        const canonical = await supabase
            .from('WhatsAppSession')
            .select('tenantId, state, status')
            .or('state.eq.CONNECTED,status.eq.connected');

        let sessions: Array<{ tenantId: string; state?: string | null; status?: string | null }> | null = canonical.data as Array<{ tenantId: string; state?: string | null; status?: string | null }> | null;

        if (canonical.error) {
            const fallback = await supabase
                .from('WhatsAppSession')
                .select('tenantId, status')
                .eq('status', 'connected');

            if (fallback.error) {
                throw fallback.error;
            }

            sessions = (fallback.data as Array<{ tenantId: string; status?: string | null }> | null) || null;
        }

        if (!sessions || sessions.length === 0) {
            logger.info('No WhatsApp sessions to reconnect');
            return;
        }

        logger.info({ count: sessions.length }, 'Reconnecting WhatsApp sessions on startup');
        for (const session of sessions) {
            connectSession(session.tenantId).catch((error) => {
                logger.error({ error, tenantId: session.tenantId }, 'Failed to reconnect WhatsApp session on startup');
            });
        }
    } catch (error) {
        logger.error({ error }, 'Failed to load WhatsApp sessions for startup reconnect');
    }
}
