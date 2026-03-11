'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api, type AutomationFlowInput } from '@/lib/api';

type AutomationFormState = {
    id: string | null;
    name: string;
    enabled: boolean;
    priority: number;
    containsText: string;
    languageIs: 'any' | 'en' | 'so';
    contactTag: string;
    messageCountThreshold: string;
    businessHoursOnly: boolean;
    waitMinutes: number;
    actionType: 'callAIReply' | 'sendText' | 'sendTemplate';
    sendText: string;
    templateId: string;
    aiPrompt: string;
    addTags: string;
  };

const emptyForm: AutomationFormState = {
    id: null,
    name: '',
    enabled: true,
    priority: 0,
    containsText: '',
    languageIs: 'any',
    contactTag: '',
    messageCountThreshold: '',
    businessHoursOnly: false,
    waitMinutes: 0,
    actionType: 'callAIReply',
    sendText: '',
    templateId: '',
    aiPrompt: '',
    addTags: '',
};

function toForm(flow: any): AutomationFormState {
    const conditions = flow.Condition || [];
    const actions = flow.Action || [];
    const containsText = conditions.find((condition: any) => condition.type === 'containsText');
    const languageIs = conditions.find((condition: any) => condition.type === 'languageIs');
    const contactTag = conditions.find((condition: any) => condition.type === 'contactTag');
    const threshold = conditions.find((condition: any) => condition.type === 'messageCountThreshold');
    const hours = conditions.find((condition: any) => condition.type === 'businessHoursOnly');
    const wait = actions.find((action: any) => action.type === 'wait');
    const addTag = actions.find((action: any) => action.type === 'addTag');
    const sendAction = actions.find((action: any) => ['callAIReply', 'sendText', 'sendTemplate'].includes(action.type));

    return {
        id: flow.id,
        name: flow.name || '',
        enabled: Boolean(flow.enabled),
        priority: flow.priority || 0,
        containsText: Array.isArray(containsText?.value) ? containsText.value.join(', ') : (containsText?.value || ''),
        languageIs: languageIs?.value || 'any',
        contactTag: Array.isArray(contactTag?.value) ? contactTag.value.join(', ') : (contactTag?.value || ''),
        messageCountThreshold: threshold?.value ? String(threshold.value) : '',
        businessHoursOnly: Boolean(hours?.value),
        waitMinutes: wait?.config?.minutes || 0,
        actionType: sendAction?.type || 'callAIReply',
        sendText: sendAction?.config?.text || '',
        templateId: sendAction?.templateId || sendAction?.config?.templateId || '',
        aiPrompt: sendAction?.config?.prompt || '',
        addTags: Array.isArray(addTag?.config?.tags) ? addTag.config.tags.join(', ') : '',
    };
}

function toPayload(form: AutomationFormState): AutomationFlowInput {
    const conditions: AutomationFlowInput['conditions'] = [];
    const actions: AutomationFlowInput['actions'] = [];

    if (form.containsText.trim()) {
        conditions.push({ type: 'containsText', value: form.containsText.split(',').map((entry) => entry.trim()).filter(Boolean) });
    }
    if (form.languageIs !== 'any') {
        conditions.push({ type: 'languageIs', value: form.languageIs });
    }
    if (form.contactTag.trim()) {
        conditions.push({ type: 'contactTag', value: form.contactTag.split(',').map((entry) => entry.trim()).filter(Boolean) });
    }
    if (form.messageCountThreshold.trim()) {
        conditions.push({ type: 'messageCountThreshold', operator: 'gte', value: Number(form.messageCountThreshold) || 0 });
    }
    if (form.businessHoursOnly) {
        conditions.push({ type: 'businessHoursOnly', value: true });
    }

    if (form.addTags.trim()) {
        actions.push({ type: 'addTag', config: { tags: form.addTags.split(',').map((entry) => entry.trim()).filter(Boolean) } });
    }
    if (form.waitMinutes > 0) {
        actions.push({ type: 'wait', config: { minutes: form.waitMinutes } });
    }

    if (form.actionType === 'sendText') {
        actions.push({ type: 'sendText', config: { text: form.sendText } });
    } else if (form.actionType === 'sendTemplate') {
        actions.push({ type: 'sendTemplate', templateId: form.templateId || null, config: { templateId: form.templateId || null } });
    } else {
        actions.push({ type: 'callAIReply', config: { prompt: form.aiPrompt } });
    }

    return {
        name: form.name,
        enabled: form.enabled,
        priority: form.priority,
        trigger: { type: 'INCOMING_MESSAGE' },
        conditions,
        actions,
    };
}

export default function AutomationsPage() {
    const [flows, setFlows] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [form, setForm] = useState<AutomationFormState>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const selectedFlow = useMemo(
        () => flows.find((flow) => flow.id === form.id) || null,
        [flows, form.id],
    );

    const loadData = () => Promise.all([api.automations.list(), api.templates.list()])
        .then(([flowData, templateData]) => {
            setFlows(flowData.flows || []);
            setTemplates(templateData.templates || []);
        });

    useEffect(() => {
        loadData()
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = toPayload(form);
            if (form.id) {
                await api.automations.update(form.id, payload);
            } else {
                await api.automations.create(payload);
            }
            await loadData();
            setForm(emptyForm);
        } catch (error: any) {
            alert(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!form.id) return;
        if (!confirm('Delete this automation flow?')) return;
        try {
            await api.automations.delete(form.id);
            await loadData();
            setForm(emptyForm);
        } catch (error: any) {
            alert(error.message);
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
                    <div className="loading-spinner" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Automations</h1>
                    <p className="page-subtitle">First matching flow wins. Use conditions + one outbound action to control delayed WhatsApp replies.</p>
                </div>
            </div>

            <div className="grid-2">
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Flows</h3>
                        <button className="btn btn-secondary" type="button" onClick={() => setForm(emptyForm)}>
                            New Flow
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {flows.length === 0 && (
                            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                No automations yet. Create your first delayed or offline reply rule.
                            </div>
                        )}
                        {flows.map((flow) => (
                            <button
                                key={flow.id}
                                type="button"
                                className="card"
                                onClick={() => setForm(toForm(flow))}
                                style={{
                                    textAlign: 'left',
                                    border: selectedFlow?.id === flow.id ? '1px solid var(--accent)' : undefined,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: 16,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                    <strong>{flow.name}</strong>
                                    <span className={`badge ${flow.enabled ? 'badge-success' : 'badge-danger'}`}>
                                        {flow.enabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Priority {flow.priority || 0} · {(flow.Condition || []).length} conditions · {(flow.Action || []).length} actions
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <form className="card" onSubmit={handleSubmit}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
                        {form.id ? 'Edit Flow' : 'Create Flow'}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label>Flow name</label>
                            <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Priority</label>
                            <input type="number" className="input" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: parseInt(event.target.value, 10) || 0 }))} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                            Enabled
                        </label>

                        <div className="input-group">
                            <label>Contains text</label>
                            <input className="input" placeholder="price, menu, support" value={form.containsText} onChange={(event) => setForm((current) => ({ ...current, containsText: event.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Language</label>
                            <select className="input" value={form.languageIs} onChange={(event) => setForm((current) => ({ ...current, languageIs: event.target.value as AutomationFormState['languageIs'] }))}>
                                <option value="any">Any</option>
                                <option value="en">English</option>
                                <option value="so">Somali</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Contact tag</label>
                            <input className="input" placeholder="vip, repeat" value={form.contactTag} onChange={(event) => setForm((current) => ({ ...current, contactTag: event.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Message count threshold</label>
                            <input className="input" type="number" placeholder="3" value={form.messageCountThreshold} onChange={(event) => setForm((current) => ({ ...current, messageCountThreshold: event.target.value }))} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                            <input type="checkbox" checked={form.businessHoursOnly} onChange={(event) => setForm((current) => ({ ...current, businessHoursOnly: event.target.checked }))} />
                            Match only during configured working hours
                        </label>
                        <div className="input-group">
                            <label>Add tags</label>
                            <input className="input" placeholder="faq, quote" value={form.addTags} onChange={(event) => setForm((current) => ({ ...current, addTags: event.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Extra wait (minutes)</label>
                            <input type="number" className="input" min={0} value={form.waitMinutes} onChange={(event) => setForm((current) => ({ ...current, waitMinutes: parseInt(event.target.value, 10) || 0 }))} />
                        </div>
                        <div className="input-group">
                            <label>Reply action</label>
                            <select className="input" value={form.actionType} onChange={(event) => setForm((current) => ({ ...current, actionType: event.target.value as AutomationFormState['actionType'] }))}>
                                <option value="callAIReply">AI Reply</option>
                                <option value="sendText">Send Text</option>
                                <option value="sendTemplate">Send Template</option>
                            </select>
                        </div>
                        {form.actionType === 'sendText' && (
                            <div className="input-group">
                                <label>Reply text</label>
                                <textarea className="input" rows={5} value={form.sendText} onChange={(event) => setForm((current) => ({ ...current, sendText: event.target.value }))} />
                            </div>
                        )}
                        {form.actionType === 'sendTemplate' && (
                            <div className="input-group">
                                <label>Template</label>
                                <select className="input" value={form.templateId} onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))}>
                                    <option value="">Select template</option>
                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>{template.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {form.actionType === 'callAIReply' && (
                            <div className="input-group">
                                <label>AI prompt override</label>
                                <textarea className="input" rows={4} placeholder="Optional extra instruction for this flow" value={form.aiPrompt} onChange={(event) => setForm((current) => ({ ...current, aiPrompt: event.target.value }))} />
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-primary" type="submit" disabled={saving}>
                                {saving ? <span className="loading-spinner" /> : form.id ? 'Update Flow' : 'Create Flow'}
                            </button>
                            {form.id && (
                                <button className="btn btn-danger" type="button" onClick={handleDelete}>
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
}
