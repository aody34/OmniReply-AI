import {
    AuthenticationState,
    BufferJSON,
    initAuthCreds,
    proto,
} from '@whiskeysockets/baileys';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';
const DEV_FALLBACK_KEY = 'omnireply-dev-whatsapp-session-key';

type EncryptedPayload = {
    iv: string;
    tag: string;
    ciphertext: string;
};

export interface SessionStore {
    getAuthState(tenantId: string): Promise<{
        state: AuthenticationState;
        saveCreds: () => Promise<void>;
    }>;
    deleteSession(tenantId: string): Promise<void>;
    sessionExists(tenantId: string): boolean;
}

let cachedEncryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
    if (cachedEncryptionKey) {
        return cachedEncryptionKey;
    }

    const configuredKey = process.env.WHATSAPP_SESSION_ENC_KEY;
    if (configuredKey) {
        cachedEncryptionKey = createHash('sha256').update(configuredKey).digest();
        return cachedEncryptionKey;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('WHATSAPP_SESSION_ENC_KEY must be configured in production');
    }

    logger.warn('WHATSAPP_SESSION_ENC_KEY is not configured; using the development fallback key');
    cachedEncryptionKey = createHash('sha256').update(DEV_FALLBACK_KEY).digest();
    return cachedEncryptionKey;
}

function encryptJson(data: unknown): EncryptedPayload {
    const key = getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = JSON.stringify(data, BufferJSON.replacer);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
    };
}

function decryptJson(payload: EncryptedPayload): any {
    const key = getEncryptionKey();
    const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(payload.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext, BufferJSON.reviver);
}

class EncryptedFileSystemSessionStore implements SessionStore {
    private baseDir: string;

    constructor(baseDir: string) {
        this.baseDir = baseDir;

        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
            logger.info({ baseDir: this.baseDir }, 'Created sessions directory');
        }
    }

    private getSessionPath(tenantId: string): string {
        return path.join(this.baseDir, tenantId);
    }

    private getSessionFilePath(tenantId: string, file: string): string {
        return path.join(this.getSessionPath(tenantId), this.fixFileName(file));
    }

    private fixFileName(file: string): string {
        return file.replace(/\//g, '__').replace(/:/g, '-');
    }

    private async writeData(tenantId: string, file: string, data: unknown): Promise<void> {
        const sessionPath = this.getSessionPath(tenantId);
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const filePath = this.getSessionFilePath(tenantId, file);
        await fs.promises.writeFile(filePath, JSON.stringify(encryptJson(data)), 'utf8');
    }

    private async readData(tenantId: string, file: string): Promise<any | null> {
        try {
            const filePath = this.getSessionFilePath(tenantId, file);
            const raw = await fs.promises.readFile(filePath, 'utf8');
            return decryptJson(JSON.parse(raw) as EncryptedPayload);
        } catch {
            return null;
        }
    }

    private async removeData(tenantId: string, file: string): Promise<void> {
        try {
            await fs.promises.unlink(this.getSessionFilePath(tenantId, file));
        } catch {
            // Ignore missing files during key rotation/logout cleanup.
        }
    }

    async getAuthState(tenantId: string): Promise<{
        state: AuthenticationState;
        saveCreds: () => Promise<void>;
    }> {
        const sessionPath = this.getSessionPath(tenantId);
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const creds = await this.readData(tenantId, 'creds.json') || initAuthCreds();

        return {
            state: {
                creds,
                keys: {
                    get: async (type: string, ids: string[]) => {
                        const values: Record<string, any> = {};

                        await Promise.all(ids.map(async (id) => {
                            let value = await this.readData(tenantId, `${type}-${id}.json`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            values[id] = value;
                        }));

                        return values;
                    },
                    set: async (data: Record<string, Record<string, unknown>>) => {
                        const writes: Promise<void>[] = [];

                        for (const category of Object.keys(data)) {
                            const categoryValues = data[category] || {};
                            for (const id of Object.keys(categoryValues)) {
                                const value = categoryValues[id];
                                const file = `${category}-${id}.json`;
                                writes.push(
                                    value ? this.writeData(tenantId, file, value) : this.removeData(tenantId, file),
                                );
                            }
                        }

                        await Promise.all(writes);
                    },
                },
            },
            saveCreds: async () => this.writeData(tenantId, 'creds.json', creds),
        };
    }

    async deleteSession(tenantId: string): Promise<void> {
        const sessionPath = this.getSessionPath(tenantId);
        if (fs.existsSync(sessionPath)) {
            await fs.promises.rm(sessionPath, { recursive: true, force: true });
            logger.info({ tenantId }, 'Deleted encrypted WhatsApp session');
        }
    }

    sessionExists(tenantId: string): boolean {
        const sessionPath = this.getSessionPath(tenantId);
        return fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
    }
}

export function createSessionStore(): SessionStore {
    return new EncryptedFileSystemSessionStore(SESSIONS_DIR);
}

export const sessionStore = createSessionStore();
