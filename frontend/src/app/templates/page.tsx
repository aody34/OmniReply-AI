'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';

type TemplateFormState = {
    id: string | null;
    name: string;
    content: string;
    variables: string;
};

const emptyForm: TemplateFormState = {
    id: null,
    name: '',
    content: '',
    variables: '',
};

function toForm(template: any): TemplateFormState {
    return {
        id: template.id,
        name: template.name || '',
        content: template.content || '',
        variables: Array.isArray(template.variables) ? template.variables.join(', ') : '',
    };
}

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [form, setForm] = useState<TemplateFormState>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadTemplates = () => api.templates.list().then((data) => setTemplates(data.templates || []));

    useEffect(() => {
        loadTemplates()
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                content: form.content,
                variables: form.variables.split(',').map((entry) => entry.trim()).filter(Boolean),
            };

            if (form.id) {
                await api.templates.update(form.id, payload);
            } else {
                await api.templates.create(payload);
            }

            await loadTemplates();
            setForm(emptyForm);
        } catch (error: any) {
            alert(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!form.id) return;
        if (!confirm('Delete this template?')) return;
        try {
            await api.templates.delete(form.id);
            await loadTemplates();
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
                    <h1 className="page-title">Templates</h1>
                    <p className="page-subtitle">Create reusable WhatsApp reply templates with variables such as {'{name}'} and {'{phone}'}.</p>
                </div>
            </div>

            <div className="grid-2">
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Saved Templates</h3>
                        <button className="btn btn-secondary" type="button" onClick={() => setForm(emptyForm)}>
                            New Template
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {templates.length === 0 && (
                            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                No templates yet.
                            </div>
                        )}
                        {templates.map((template) => (
                            <button
                                key={template.id}
                                type="button"
                                className="card"
                                onClick={() => setForm(toForm(template))}
                                style={{
                                    textAlign: 'left',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: 16,
                                    border: form.id === template.id ? '1px solid var(--accent)' : undefined,
                                }}
                            >
                                <strong style={{ display: 'block', marginBottom: 8 }}>{template.name}</strong>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    {template.content}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <form className="card" onSubmit={handleSubmit}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
                        {form.id ? 'Edit Template' : 'Create Template'}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label>Name</label>
                            <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Variables</label>
                            <input className="input" placeholder="name, phone, orderId" value={form.variables} onChange={(event) => setForm((current) => ({ ...current, variables: event.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Content</label>
                            <textarea className="input" rows={8} placeholder="Hello {name}, your order {orderId} is ready." value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-primary" type="submit" disabled={saving}>
                                {saving ? <span className="loading-spinner" /> : form.id ? 'Update Template' : 'Create Template'}
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
