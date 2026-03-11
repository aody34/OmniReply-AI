import supabase from '../db';

export type OwnerActivityStatus = {
    lastActiveAt: string | null;
    offline: boolean;
};

export async function recordOwnerHeartbeat(
    tenantId: string,
    userId: string,
    source = 'dashboard',
): Promise<void> {
    const now = new Date().toISOString();

    const { error } = await supabase
        .from('OwnerActivity')
        .upsert({
            tenantId,
            userId,
            source,
            lastActiveAt: now,
            lastHeartbeatAt: now,
            updatedAt: now,
        }, { onConflict: 'tenantId,userId' });

    if (error) {
        throw error;
    }
}

export async function recordManualReplyActivity(
    tenantId: string,
    userId: string,
): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('OwnerActivity')
        .upsert({
            tenantId,
            userId,
            source: 'manual_whatsapp_reply',
            lastActiveAt: now,
            lastManualReplyAt: now,
            updatedAt: now,
        }, { onConflict: 'tenantId,userId' });

    if (error) {
        throw error;
    }
}

export async function recordTenantManualReplyActivity(tenantId: string): Promise<void> {
    const { data, error } = await supabase
        .from('User')
        .select('id, role')
        .eq('tenantId', tenantId)
        .in('role', ['owner', 'admin'])
        .order('createdAt', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data?.id) {
        return;
    }

    await recordManualReplyActivity(tenantId, data.id);
}

export function isOwnerOffline(
    lastActiveAt: string | null,
    offlineGraceMinutes: number,
    now = new Date(),
): boolean {
    if (!lastActiveAt) {
        return true;
    }

    const lastSeenMs = new Date(lastActiveAt).getTime();
    if (Number.isNaN(lastSeenMs)) {
        return true;
    }

    return now.getTime() - lastSeenMs > offlineGraceMinutes * 60_000;
}

export async function getOwnerActivityStatus(
    tenantId: string,
    offlineGraceMinutes: number,
): Promise<OwnerActivityStatus> {
    const { data, error } = await supabase
        .from('OwnerActivity')
        .select('lastActiveAt')
        .eq('tenantId', tenantId)
        .order('lastActiveAt', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    const lastActiveAt = data?.lastActiveAt || null;

    return {
        lastActiveAt,
        offline: isOwnerOffline(lastActiveAt, offlineGraceMinutes),
    };
}
