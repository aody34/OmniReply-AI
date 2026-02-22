// ============================================
// OmniReply AI — WhatsApp Multi-Session Connector (Supabase JS)
// Manages concurrent Baileys connections per tenant
// ============================================

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import supabase from '../db';
import logger from '../utils/logger';
import { statusMonitor } from './status-monitor';

// QR code storage
const qrCodes: Map<string, string> = new Map();
import { handleIncomingMessage } from '../ai/handler';
import { activateHumanOverride } from '../amniga/anti-ban';

declare module 'qrcode-terminal' {
    export function generate(text: string, options?: { small?: boolean }): void;
}

const activeSockets: Map<string, WASocket> = new Map();
const sessionsDir = process.env.SESSIONS_DIR || './sessions';

/**
 * Get the active socket for a tenant
 */
export function getActiveSocket(tenantId: string): WASocket | null {
    return activeSockets.get(tenantId) || null;
}

/**
 * Get QR code for a tenant
 */
export function getQR(tenantId: string): string | null {
    return qrCodes.get(tenantId) || null;
}

/**
 * Connect a WhatsApp session for a tenant
 */
export async function connectSession(tenantId: string): Promise<void> {
    // Don't double-connect
    if (activeSockets.has(tenantId)) {
        logger.info({ tenantId }, 'Session already active');
        return;
    }

    const sessionPath = path.join(sessionsDir, tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    statusMonitor.updateStatus(tenantId, { status: 'connecting' as any });

    const socket = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger as any),
        },
        printQRInTerminal: true,
        logger: logger as any,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: true,
    });

    // Handle connection updates
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodes.set(tenantId, qr);
            statusMonitor.updateStatus(tenantId, { status: 'qr_ready', qrCode: qr });
            logger.info({ tenantId }, '📱 QR code generated — scan to connect');
        }

        if (connection === 'open') {
            statusMonitor.updateStatus(tenantId, { status: 'connected' });
            qrCodes.delete(tenantId);
            activeSockets.set(tenantId, socket);

            // Update session in database
            const phone = socket.user?.id?.split(':')[0] || null;
            const { data: existingSession } = await supabase
                .from('WhatsAppSession')
                .select('id')
                .eq('tenantId', tenantId)
                .single();

            if (existingSession) {
                await supabase
                    .from('WhatsAppSession')
                    .update({
                        phone,
                        status: 'connected',
                        lastActive: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    })
                    .eq('tenantId', tenantId);
            } else {
                await supabase.from('WhatsAppSession').insert({
                    tenantId,
                    phone,
                    status: 'connected',
                    lastActive: new Date().toISOString(),
                });
            }

            logger.info({ tenantId, phone }, '✅ WhatsApp connected');
        }

        if (connection === 'close') {
            activeSockets.delete(tenantId);
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                statusMonitor.updateStatus(tenantId, { status: 'disconnected' });
                await supabase
                    .from('WhatsAppSession')
                    .update({ status: 'disconnected', updatedAt: new Date().toISOString() })
                    .eq('tenantId', tenantId);
                logger.info({ tenantId }, '🔌 WhatsApp logged out');
            } else {
                // Auto-reconnect
                statusMonitor.updateStatus(tenantId, { status: 'authenticating' as any });
                logger.info({ tenantId, statusCode }, '🔄 Reconnecting...');
                setTimeout(() => connectSession(tenantId), 5000);
            }
        }
    });

    // Save credentials on update
    socket.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Skip own messages and status broadcasts
            if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;

            const phone = msg.key.remoteJid || '';
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                '';

            if (!text || !phone) continue;

            // Check if this is the owner replying (human override)
            if (msg.key.fromMe) {
                activateHumanOverride(tenantId, phone);
                continue;
            }

            // Route to AI handler
            await handleIncomingMessage(tenantId, phone, text, socket);
        }
    });
}

/**
 * Disconnect a WhatsApp session
 */
export async function disconnectSession(tenantId: string): Promise<void> {
    const socket = activeSockets.get(tenantId);
    if (socket) {
        await socket.logout();
        activeSockets.delete(tenantId);
    }
    statusMonitor.updateStatus(tenantId, { status: 'disconnected' });

    await supabase
        .from('WhatsAppSession')
        .update({ status: 'disconnected', updatedAt: new Date().toISOString() })
        .eq('tenantId', tenantId);
}

/**
 * Reconnect all existing sessions on server startup
 */
export async function reconnectAllSessions(): Promise<void> {
    try {
        const { data: sessions } = await supabase
            .from('WhatsAppSession')
            .select('tenantId')
            .eq('status', 'connected');

        if (!sessions || sessions.length === 0) {
            logger.info('No sessions to reconnect');
            return;
        }

        logger.info({ count: sessions.length }, '🔄 Reconnecting WhatsApp sessions...');
        for (const session of sessions) {
            connectSession(session.tenantId).catch(err => {
                logger.error({ error: err, tenantId: session.tenantId }, 'Failed to reconnect');
            });
        }
    } catch (err) {
        logger.error({ error: err }, 'Failed to load sessions for reconnection');
    }
}
