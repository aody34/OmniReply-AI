'use client';
// ============================================
// OmniReply AI — Settings Page
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
    const { user } = useAuth();
    const [tenant, setTenant] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [form, setForm] = useState({
        name: '',
        businessType: '',
        defaultLanguage: 'en',
        dailyMessageLimit: 100,
        aiPauseDuration: 30,
    });

    useEffect(() => {
        api.tenant.settings()
            .then(data => {
                setTenant(data.tenant);
                setForm({
                    name: data.tenant?.name || '',
                    businessType: data.tenant?.businessType || '',
                    defaultLanguage: data.tenant?.defaultLanguage || 'en',
                    dailyMessageLimit: data.tenant?.dailyMessageLimit || 100,
                    aiPauseDuration: data.tenant?.aiPauseDuration || 30,
                });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaved(false);
        try {
            await api.tenant.update(form);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) { alert(err.message); }
        finally { setSaving(false); }
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
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Configure your business and AI preferences</p>
                </div>
            </div>

            <div className="grid-2">
                {/* Business Settings */}
                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>🏢 Business Settings</h3>
                    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label>Business Name</label>
                            <input className="input" value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="input-group">
                            <label>Business Type</label>
                            <select className="input" value={form.businessType}
                                onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))}>
                                <option value="general">General</option>
                                <option value="restaurant">Restaurant</option>
                                <option value="retail">Retail / Shop</option>
                                <option value="pharmacy">Pharmacy</option>
                                <option value="clinic">Clinic / Hospital</option>
                                <option value="salon">Salon / Barber</option>
                                <option value="education">Education</option>
                                <option value="services">Professional Services</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Default Language</label>
                            <select className="input" value={form.defaultLanguage}
                                onChange={e => setForm(f => ({ ...f, defaultLanguage: e.target.value }))}>
                                <option value="en">English</option>
                                <option value="so">Somali (Af-Soomaali)</option>
                            </select>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={saving}
                            style={{ alignSelf: 'flex-start' }}>
                            {saving ? <span className="loading-spinner" /> : saved ? '✅ Saved!' : '💾 Save Changes'}
                        </button>
                    </form>
                </div>

                {/* AI Settings */}
                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>🤖 AI Settings</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label>Daily Message Limit</label>
                            <input type="number" className="input" value={form.dailyMessageLimit}
                                onChange={e => setForm(f => ({ ...f, dailyMessageLimit: parseInt(e.target.value) || 100 }))}
                                min={10} max={10000} />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Max AI-generated messages per day
                            </span>
                        </div>
                        <div className="input-group">
                            <label>Human Override Duration (minutes)</label>
                            <input type="number" className="input" value={form.aiPauseDuration}
                                onChange={e => setForm(f => ({ ...f, aiPauseDuration: parseInt(e.target.value) || 30 }))}
                                min={5} max={1440} />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                When you reply manually, AI pauses for this duration
                            </span>
                        </div>
                    </div>
                </div>

                {/* Account Info */}
                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>👤 Account Info</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Name</span>
                            <span style={{ fontWeight: 500 }}>{user?.name}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Email</span>
                            <span>{user?.email}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Role</span>
                            <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{user?.role}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Plan</span>
                            <span className="badge badge-success" style={{ textTransform: 'capitalize' }}>{tenant?.plan || 'free'}</span>
                        </div>
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="card" style={{ borderColor: 'rgba(255, 71, 87, 0.3)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--status-offline)' }}>
                        ⚠️ Danger Zone
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                        These actions are irreversible. Please proceed with caution.
                    </p>
                    <button className="btn btn-danger" disabled>
                        Delete Account (Coming Soon)
                    </button>
                </div>
            </div>
        </DashboardLayout>
    );
}
