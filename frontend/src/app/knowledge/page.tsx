'use client';
// ============================================
// OmniReply AI — Knowledge Base Manager
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';

const CATEGORIES = ['menu', 'faq', 'policy', 'price_list', 'hours', 'general'];

export default function KnowledgePage() {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [form, setForm] = useState({ category: 'general', title: '', content: '' });
    const [saving, setSaving] = useState(false);

    const fetchEntries = async () => {
        try {
            const data = await api.knowledge.list(filter || undefined);
            setEntries(data.entries || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchEntries(); }, [filter]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editId) {
                await api.knowledge.update(editId, form);
            } else {
                await api.knowledge.create(form);
            }
            setShowForm(false);
            setEditId(null);
            setForm({ category: 'general', title: '', content: '' });
            fetchEntries();
        } catch (err: any) {
            alert(err.message);
        }
        setSaving(false);
    };

    const handleEdit = (entry: any) => {
        setForm({ category: entry.category, title: entry.title, content: entry.content });
        setEditId(entry.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this knowledge entry?')) return;
        try {
            await api.knowledge.delete(id);
            fetchEntries();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Knowledge Base</h1>
                    <p className="page-subtitle">Teach your AI about your business</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ category: 'general', title: '', content: '' }); }}>
                    + Add Entry
                </button>
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button className={`btn btn-sm ${filter === '' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFilter('')}>All</button>
                {CATEGORIES.map(cat => (
                    <button key={cat}
                        className={`btn btn-sm ${filter === cat ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter(cat)}
                        style={{ textTransform: 'capitalize' }}
                    >{cat.replace('_', ' ')}</button>
                ))}
            </div>

            {/* Entries Table */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                    <div className="loading-spinner" />
                </div>
            ) : entries.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📚</div>
                    <div className="empty-title">No knowledge entries yet</div>
                    <p>Add information about your business so the AI can answer customer questions.</p>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Title</th>
                                <th>Content</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id}>
                                    <td><span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{entry.category.replace('_', ' ')}</span></td>
                                    <td style={{ fontWeight: 500 }}>{entry.title}</td>
                                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                        {entry.content}
                                    </td>
                                    <td>
                                        <span className={`badge ${entry.isActive ? 'badge-success' : 'badge-danger'}`}>
                                            {entry.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(entry)}>✏️</button>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(entry.id)}>🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">{editId ? '✏️ Edit Entry' : '📚 Add Knowledge Entry'}</h2>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Category</label>
                                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Title</label>
                                <input className="input" placeholder="e.g., Business Hours" value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
                            </div>
                            <div className="input-group">
                                <label>Content</label>
                                <textarea className="input" placeholder="Enter the information your AI should know..."
                                    value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} required />
                            </div>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? <span className="loading-spinner" /> : editId ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
