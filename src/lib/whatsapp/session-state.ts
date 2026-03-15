import supabase, { isDbConfigured } from '../db';
import logger from '../utils/logger';
import { WhatsAppSessionState, WhatsAppStatus } from '../../types';
import { statusMonitor } from './status-monitor';

type SessionRow = {
    tenantId: string;
    sessionId?: string | null;
    state?: string | null;
    status?: string | null;
    qr?: string | null;
    reason?: string | null;
    phone?: string | null;
    updatedAt?: string | null;
    lastSeenAt?: string | null;
    connectedAt?: string | null;
    disconnectedAt?: string | null;
    lastActive?: string | null;
};

type SessionTransitionInput = {
    state: WhatsAppSessionState;
    qr?: string | null;
    reason?: string | null;
    phoneNumber?: string | null;
    sessionId?: string | null;
    updatedAt?: string;
};

const TABLE_NAME = 'WhatsAppSession';
const DEFAULT_UPDATED_AT = new Date(0).toISOString();
let loggedCanonicalSchemaFallback = false;
let loggedLegacySchemaFallback = false;

type DbErrorLike = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

function parseState(value?: string | null): WhatsAppSessionState {
    switch ((value || '').toUpperCase()) {
        case 'QR':
        case 'QR_READY':
            return 'QR';
        case 'CONNECTING':
        case 'AUTHENTICATING':
            return 'CONNECTING';
        case 'CONNECTED':
            return 'CONNECTED';
        case 'ERROR':
            return 'ERROR';
        case 'DISCONNECTED':
        default:
            return 'DISCONNECTED';
    }
}

function toLegacyStatus(state: WhatsAppSessionState): string {
    switch (state) {
        case 'QR':
            return 'qr_ready';
        case 'CONNECTING':
            return 'connecting';
        case 'CONNECTED':
            return 'connected';
        case 'ERROR':
            return 'error';
        case 'DISCONNECTED':
        default:
            return 'disconnected';
    }
}

function isSchemaMismatchError(error: DbErrorLike | null | undefined): boolean {
    const code = (error?.code || '').toUpperCase();
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

    return (
        code === '42703' ||
        code === '42P01' ||
        code === 'PGRST204' ||
        code === 'PGRST205' ||
        text.includes('could not find the') ||
        text.includes('schema cache') ||
        text.includes('column') ||
        text.includes('relation') ||
        text.includes('does not exist')
    );
}

function logSchemaFallback(kind: 'canonical' | 'legacy', error: DbErrorLike): void {
    if (kind === 'canonical') {
        if (loggedCanonicalSchemaFallback) return;
        loggedCanonicalSchemaFallback = true;
        logger.warn({ code: error.code, message: error.message }, 'WhatsApp session canonical columns unavailable; using legacy DB fallback');
        return;
    }

    if (loggedLegacySchemaFallback) return;
    loggedLegacySchemaFallback = true;
    logger.warn({ code: error.code, message: error.message }, 'WhatsApp session table unavailable; using in-memory fallback only');
}

export function createDefaultWhatsAppStatus(tenantId: string, reason: string | null = null): WhatsAppStatus {
    return {
        tenantId,
        sessionId: null,
        state: 'DISCONNECTED',
        qr: null,
        reason,
        phoneNumber: null,
        updatedAt: DEFAULT_UPDATED_AT,
        lastSeenAt: null,
        connectedAt: null,
        disconnectedAt: null,
    };
}

function normalizeRow(row: SessionRow | null | undefined, tenantId: string): WhatsAppStatus {
    if (!row) {
        return createDefaultWhatsAppStatus(tenantId);
    }

    const state = parseState(row.state || row.status);

    return {
        tenantId,
        sessionId: row.sessionId || null,
        state,
        qr: row.qr || null,
        reason: row.reason || null,
        phoneNumber: state === 'CONNECTED' ? row.phone || null : null,
        updatedAt: row.updatedAt || DEFAULT_UPDATED_AT,
        lastSeenAt: row.lastSeenAt || row.lastActive || null,
        connectedAt: row.connectedAt || null,
        disconnectedAt: row.disconnectedAt || null,
    };
}

function isMoreRecent(candidate: WhatsAppStatus, current: WhatsAppStatus): boolean {
    return Date.parse(candidate.updatedAt || DEFAULT_UPDATED_AT) > Date.parse(current.updatedAt || DEFAULT_UPDATED_AT);
}

export function buildNextWhatsAppStatus(current: WhatsAppStatus, input: SessionTransitionInput): WhatsAppStatus {
    const updatedAt = input.updatedAt || new Date().toISOString();
    const next: WhatsAppStatus = {
        ...current,
        tenantId: current.tenantId,
        sessionId: input.sessionId ?? current.sessionId ?? `${current.tenantId}:primary`,
        state: input.state,
        qr: input.qr ?? null,
        reason: input.reason ?? null,
        phoneNumber: input.phoneNumber ?? current.phoneNumber ?? null,
        updatedAt,
        lastSeenAt: updatedAt,
        connectedAt: current.connectedAt,
        disconnectedAt: current.disconnectedAt,
    };

    switch (input.state) {
        case 'QR':
            next.phoneNumber = null;
            next.qr = input.qr ?? null;
            next.reason = null;
            break;
        case 'CONNECTING':
            next.phoneNumber = null;
            next.qr = null;
            next.reason = input.reason ?? null;
            break;
        case 'CONNECTED':
            next.qr = null;
            next.reason = null;
            next.phoneNumber = input.phoneNumber ?? current.phoneNumber ?? null;
            next.connectedAt = current.state === 'CONNECTED' && current.connectedAt ? current.connectedAt : updatedAt;
            break;
        case 'DISCONNECTED':
            next.phoneNumber = null;
            next.qr = null;
            next.disconnectedAt = updatedAt;
            break;
        case 'ERROR':
            next.phoneNumber = null;
            next.qr = null;
            next.disconnectedAt = updatedAt;
            break;
    }

    return next;
}

async function readStatusRow(tenantId: string): Promise<SessionRow | null> {
    const canonical = await supabase
        .from(TABLE_NAME)
        .select('tenantId, sessionId, state, status, qr, reason, phone, updatedAt, lastSeenAt, connectedAt, disconnectedAt, lastActive')
        .eq('tenantId', tenantId)
        .maybeSingle();

    if (!canonical.error) {
        return (canonical.data as SessionRow | null) || null;
    }

    if (!isSchemaMismatchError(canonical.error)) {
        throw canonical.error;
    }

    logSchemaFallback('canonical', canonical.error);

    const legacy = await supabase
        .from(TABLE_NAME)
        .select('tenantId, phone, status, updatedAt, lastActive')
        .eq('tenantId', tenantId)
        .maybeSingle();

    if (!legacy.error) {
        return (legacy.data as SessionRow | null) || null;
    }

    if (isSchemaMismatchError(legacy.error)) {
        logSchemaFallback('legacy', legacy.error);
        return null;
    }

    throw legacy.error;
}

function cacheStatus(status: WhatsAppStatus): WhatsAppStatus {
    statusMonitor.setStatus(status);
    return status;
}

export async function getCanonicalWhatsAppStatus(tenantId: string): Promise<WhatsAppStatus> {
    const inMemory = statusMonitor.getStatus(tenantId);

    if (!isDbConfigured) {
        return inMemory.updatedAt !== DEFAULT_UPDATED_AT ? inMemory : createDefaultWhatsAppStatus(tenantId);
    }

    const fromDb = normalizeRow(await readStatusRow(tenantId), tenantId);
    if (inMemory.updatedAt !== DEFAULT_UPDATED_AT && isMoreRecent(inMemory, fromDb)) {
        return cacheStatus(inMemory);
    }

    return cacheStatus(fromDb);
}

export async function setCanonicalWhatsAppState(tenantId: string, input: SessionTransitionInput): Promise<WhatsAppStatus> {
    const current = await getCanonicalWhatsAppStatus(tenantId).catch(() => createDefaultWhatsAppStatus(tenantId));
    const next = buildNextWhatsAppStatus(current, input);

    logger.info(
        {
            tenantId,
            oldState: current.state,
            newState: next.state,
            reason: next.reason,
        },
        'WhatsApp session transition',
    );

    if (!isDbConfigured) {
        return cacheStatus(next);
    }

    const payload = {
        tenantId,
        sessionId: next.sessionId,
        status: toLegacyStatus(next.state),
        state: next.state,
        qr: next.qr,
        reason: next.reason,
        phone: next.phoneNumber,
        lastActive: next.lastSeenAt,
        lastSeenAt: next.lastSeenAt,
        connectedAt: next.connectedAt,
        disconnectedAt: next.disconnectedAt,
        updatedAt: next.updatedAt,
    };

    const canonical = await supabase
        .from(TABLE_NAME)
        .upsert(payload, { onConflict: 'tenantId' })
        .select('tenantId, sessionId, state, status, qr, reason, phone, updatedAt, lastSeenAt, connectedAt, disconnectedAt, lastActive')
        .single();

    if (!canonical.error) {
        return cacheStatus(normalizeRow(canonical.data as SessionRow, tenantId));
    }

    if (!isSchemaMismatchError(canonical.error)) {
        logger.error({ error: canonical.error, tenantId, attemptedState: next.state }, 'Failed to persist WhatsApp session state');
        throw canonical.error;
    }

    logSchemaFallback('canonical', canonical.error);

    const legacyPayload = {
        tenantId,
        phone: next.phoneNumber,
        status: toLegacyStatus(next.state),
        lastActive: next.lastSeenAt,
        updatedAt: next.updatedAt,
    };

    const legacy = await supabase
        .from(TABLE_NAME)
        .upsert(legacyPayload, { onConflict: 'tenantId' })
        .select('tenantId, phone, status, updatedAt, lastActive')
        .single();

    if (legacy.error) {
        if (isSchemaMismatchError(legacy.error)) {
            logSchemaFallback('legacy', legacy.error);
            return cacheStatus(next);
        }

        logger.error({ error: legacy.error, tenantId, attemptedState: next.state }, 'Failed to persist legacy WhatsApp session state');
        throw legacy.error;
    }

    return cacheStatus({
        ...next,
        ...normalizeRow(legacy.data as SessionRow, tenantId),
        state: next.state,
        qr: next.qr,
        reason: next.reason,
        sessionId: next.sessionId,
        connectedAt: next.connectedAt,
        disconnectedAt: next.disconnectedAt,
    });
}
