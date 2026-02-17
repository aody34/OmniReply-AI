// ============================================
// OmniReply AI — WhatsApp Session Store
// Persistent filesystem-based auth state
// Architected for easy Redis migration
// ============================================

import { useMultiFileAuthState, AuthenticationState } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';

// ── Interface for swappable session backends ──
export interface SessionStore {
    getAuthState(tenantId: string): Promise<{
        state: AuthenticationState;
        saveCreds: () => Promise<void>;
    }>;
    deleteSession(tenantId: string): Promise<void>;
    sessionExists(tenantId: string): boolean;
}

// ── Filesystem Implementation (MVP) ──
class FileSystemSessionStore implements SessionStore {
    private baseDir: string;

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        // Ensure base directory exists
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
            logger.info(`Created sessions directory: ${this.baseDir}`);
        }
    }

    private getSessionPath(tenantId: string): string {
        return path.join(this.baseDir, tenantId);
    }

    async getAuthState(tenantId: string) {
        const sessionPath = this.getSessionPath(tenantId);

        // Ensure tenant session directory exists
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        logger.info({ tenantId }, 'Loading auth state from filesystem');
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        return { state, saveCreds };
    }

    async deleteSession(tenantId: string): Promise<void> {
        const sessionPath = this.getSessionPath(tenantId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            logger.info({ tenantId }, 'Session deleted from filesystem');
        }
    }

    sessionExists(tenantId: string): boolean {
        const sessionPath = this.getSessionPath(tenantId);
        return fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
    }
}

// ── Factory: Swap to Redis later by changing this ──
export function createSessionStore(): SessionStore {
    // TODO: For production, implement RedisSessionStore and switch here
    // if (process.env.SESSION_BACKEND === 'redis') {
    //   return new RedisSessionStore(process.env.REDIS_URL!);
    // }
    return new FileSystemSessionStore(SESSIONS_DIR);
}

// Export singleton
export const sessionStore = createSessionStore();
