import supabase from './db';

export type DailyStatIncrements = {
    messagesIn?: number;
    messagesOut?: number;
    aiResponses?: number;
    newLeads?: number;
    broadcastsSent?: number;
};

export async function upsertDailyStat(
    tenantId: string,
    increments: DailyStatIncrements,
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
        .from('DailyStat')
        .select('*')
        .eq('tenantId', tenantId)
        .eq('date', today)
        .maybeSingle();

    if (existing) {
        const update: Record<string, number> = {};
        if (increments.messagesIn) update.messagesIn = (existing.messagesIn || 0) + increments.messagesIn;
        if (increments.messagesOut) update.messagesOut = (existing.messagesOut || 0) + increments.messagesOut;
        if (increments.aiResponses) update.aiResponses = (existing.aiResponses || 0) + increments.aiResponses;
        if (increments.newLeads) update.newLeads = (existing.newLeads || 0) + increments.newLeads;
        if (increments.broadcastsSent) update.broadcastsSent = (existing.broadcastsSent || 0) + increments.broadcastsSent;

        await supabase
            .from('DailyStat')
            .update(update)
            .eq('id', existing.id)
            .eq('tenantId', tenantId);
        return;
    }

    await supabase.from('DailyStat').insert({
        tenantId,
        date: today,
        messagesIn: increments.messagesIn || 0,
        messagesOut: increments.messagesOut || 0,
        aiResponses: increments.aiResponses || 0,
        newLeads: increments.newLeads || 0,
        broadcastsSent: increments.broadcastsSent || 0,
    });
}
