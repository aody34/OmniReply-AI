'use client';
// ============================================
// OmniReply AI — Leads / CRM Page
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';

export default function LeadsPage() {
    const [leads, setLeads] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const limit = 20;

    const fetchLeads = async () => {
        setLoading(true);
        try {
            const data = await api.leads.list({ search: search || undefined, page, limit });
            setLeads(data.leads || []);
            setTotal(data.total || 0);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchLeads(); }, [page, search]);

    const totalPages = Math.ceil(total / limit);

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Leads / CRM</h1>
                    <p className="page-subtitle">{total} contacts captured from WhatsApp</p>
                </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 20 }}>
                <input
                    className="input"
                    placeholder="🔍 Search by name or phone number..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    style={{ maxWidth: 400 }}
                />
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                    <div className="loading-spinner" />
                </div>
            ) : leads.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">👥</div>
                    <div className="empty-title">No leads yet</div>
                    <p>Leads are automatically captured when customers message you on WhatsApp.</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Score</th>
                                    <th>Messages</th>
                                    <th>Last Contact</th>
                                    <th>Tags</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map(lead => (
                                    <tr key={lead.id}>
                                        <td style={{ fontWeight: 500 }}>{lead.name || '—'}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{lead.phone}</td>
                                        <td>
                                            <span className={`badge ${lead.score >= 7 ? 'badge-success' : lead.score >= 4 ? 'badge-warning' : 'badge-info'}`}>
                                                {lead.score || 0}/10
                                            </span>
                                        </td>
                                        <td>{lead.messageCount || 0}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                            {lead.lastContactAt ? new Date(lead.lastContactAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td>
                                            {lead.tags?.map((tag: string) => (
                                                <span key={tag} className="badge badge-info" style={{ marginRight: 4, fontSize: 11 }}>{tag}</span>
                                            )) || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                            <button className="btn btn-secondary btn-sm" disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}>← Prev</button>
                            <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                                Page {page} of {totalPages}
                            </span>
                            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}>Next →</button>
                        </div>
                    )}
                </>
            )}
        </DashboardLayout>
    );
}
