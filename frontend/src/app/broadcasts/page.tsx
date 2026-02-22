'use client';
// ============================================
// OmniReply AI — Broadcasts Page
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';

export default function BroadcastsPage() {
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ message: '', recipients: '' });
    const [sending, setSending] = useState(false);

    const fetchBroadcasts = async () => {
        try {
            const data = await api.broadcasts.list();
            setBroadcasts(data.broadcasts || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchBroadcasts(); }, []);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            const recipients = form.recipients.split('\n').map(r => r.trim()).filter(Boolean);
            if (recipients.length === 0) {
                alert('Please enter at least one phone number');
                setSending(false);
                return;
            }
            await api.broadcasts.create({ message: form.message, recipients });
            setShowForm(false);
            setForm({ message: '', recipients: '' });
            fetchBroadcasts();
        } catch (err: any) { alert(err.message); }
        finally { setSending(false); }
    };

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Broadcasts</h1>
                    <p className="page-subtitle">Send bulk messages to your customers</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    📢 New Broadcast
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                    <div className="loading-spinner" />
                </div>
            ) : broadcasts.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📢</div>
                    <div className="empty-title">No broadcasts yet</div>
                    <p>Create your first broadcast to reach all your customers at once.</p>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Message</th>
                                <th>Recipients</th>
                                <th>Sent</th>
                                <th>Failed</th>
                                <th>Status</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {broadcasts.map(bc => (
                                <tr key={bc.id}>
                                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {bc.message}
                                    </td>
                                    <td>{bc.totalRecipients || 0}</td>
                                    <td style={{ color: 'var(--status-online)' }}>{bc.sentCount || 0}</td>
                                    <td style={{ color: 'var(--status-offline)' }}>{bc.failedCount || 0}</td>
                                    <td>
                                        <span className={`badge ${bc.status === 'completed' ? 'badge-success' : bc.status === 'sending' ? 'badge-warning' : 'badge-info'}`}
                                            style={{ textTransform: 'capitalize' }}>
                                            {bc.status}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                        {new Date(bc.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* New Broadcast Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">📢 New Broadcast</h2>
                        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Message</label>
                                <textarea className="input" placeholder="Type your broadcast message..."
                                    value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required />
                            </div>
                            <div className="input-group">
                                <label>Recipients (one phone per line)</label>
                                <textarea className="input" placeholder={`2521234567\n2527654321\n...`}
                                    value={form.recipients} onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))} required
                                    style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 13 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={sending}>
                                    {sending ? <span className="loading-spinner" /> : '🚀 Send Broadcast'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
