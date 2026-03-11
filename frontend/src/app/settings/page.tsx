'use client';
// ============================================
// OmniReply AI — Settings Page
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api, type AutomationSettingsPayload } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const defaultAutomationSettings: AutomationSettingsPayload = {
    autoReplyMode: 'DELAYED',
    replyDelayMinutes: 20,
    offlineGraceMinutes: 10,
    workingHours: null,
    enableHumanOverride: true,
    humanOverrideMinutes: 30,
};

export default function SettingsPage() {
    const { user } = useAuth();
    const [tenant, setTenant] = useState<any>(null);
    const [ownerActivity, setOwnerActivity] = useState<{ lastActiveAt: string | null; offline: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tenantForm, setTenantForm] = useState({
        name: '',
        businessType: 'general',
        aiPersonality: 'professional',
        maxDailyMessages: 100,
    });
    const [automationForm, setAutomationForm] = useState<AutomationSettingsPayload>(defaultAutomationSettings);

    useEffect(() => {
        Promise.all([api.tenant.settings(), api.settings.get()])
            .then(([tenantData, automationData]) => {
                setTenant(tenantData.tenant);
                setTenantForm({
                    name: tenantData.tenant?.name || '',
                    businessType: tenantData.tenant?.businessType || 'general',
                    aiPersonality: tenantData.tenant?.aiPersonality || 'professional',
                    maxDailyMessages: tenantData.tenant?.maxDailyMessages || 100,
                });
                setAutomationForm(automationData.settings || defaultAutomationSettings);
                setOwnerActivity(automationData.ownerActivity);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setSaved(false);
        try {
            await Promise.all([
                api.tenant.update(tenantForm),
                api.settings.update(automationForm),
            ]);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error: any) {
            alert(error.message);
        } finally {
            setSaving(false);
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

    const workingHoursEnabled = Boolean(automationForm.workingHours?.enabled);

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Business profile, reply timing, and owner availability controls</p>
                </div>
            </div>

            <form onSubmit={handleSave} className="grid-2">
                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Business</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label>Business Name</label>
                            <input
                                className="input"
                                value={tenantForm.name}
                                onChange={(event) => setTenantForm((current) => ({ ...current, name: event.target.value }))}
                            />
                        </div>
                        <div className="input-group">
                            <label>Business Type</label>
                            <select
                                className="input"
                                value={tenantForm.businessType}
                                onChange={(event) => setTenantForm((current) => ({ ...current, businessType: event.target.value }))}
                            >
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
                            <label>AI Personality</label>
                            <select
                                className="input"
                                value={tenantForm.aiPersonality}
                                onChange={(event) => setTenantForm((current) => ({ ...current, aiPersonality: event.target.value }))}
                            >
                                <option value="professional">Professional</option>
                                <option value="friendly">Friendly</option>
                                <option value="formal">Formal</option>
                                <option value="concise">Concise</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Daily outbound limit</label>
                            <input
                                type="number"
                                className="input"
                                min={1}
                                max={10000}
                                value={tenantForm.maxDailyMessages}
                                onChange={(event) => setTenantForm((current) => ({ ...current, maxDailyMessages: parseInt(event.target.value, 10) || 100 }))}
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Reply Automation</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label>Auto reply mode</label>
                            <select
                                className="input"
                                value={automationForm.autoReplyMode}
                                onChange={(event) => setAutomationForm((current) => ({
                                    ...current,
                                    autoReplyMode: event.target.value as AutomationSettingsPayload['autoReplyMode'],
                                }))}
                            >
                                <option value="OFF">Off</option>
                                <option value="DELAYED">Delayed</option>
                                <option value="OFFLINE_ONLY">Offline only</option>
                                <option value="HYBRID">Hybrid</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Reply delay (minutes)</label>
                            <input
                                type="number"
                                className="input"
                                min={1}
                                value={automationForm.replyDelayMinutes}
                                onChange={(event) => setAutomationForm((current) => ({
                                    ...current,
                                    replyDelayMinutes: parseInt(event.target.value, 10) || 20,
                                }))}
                            />
                        </div>
                        <div className="input-group">
                            <label>Offline grace (minutes)</label>
                            <input
                                type="number"
                                className="input"
                                min={1}
                                value={automationForm.offlineGraceMinutes}
                                onChange={(event) => setAutomationForm((current) => ({
                                    ...current,
                                    offlineGraceMinutes: parseInt(event.target.value, 10) || 10,
                                }))}
                            />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                            <input
                                type="checkbox"
                                checked={automationForm.enableHumanOverride}
                                onChange={(event) => setAutomationForm((current) => ({
                                    ...current,
                                    enableHumanOverride: event.target.checked,
                                }))}
                            />
                            Pause AI when a human replies manually
                        </label>
                        <div className="input-group">
                            <label>Human override pause (minutes)</label>
                            <input
                                type="number"
                                className="input"
                                min={1}
                                value={automationForm.humanOverrideMinutes}
                                onChange={(event) => setAutomationForm((current) => ({
                                    ...current,
                                    humanOverrideMinutes: parseInt(event.target.value, 10) || 30,
                                }))}
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Working Hours</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                            <input
                                type="checkbox"
                                checked={workingHoursEnabled}
                                onChange={(event) => setAutomationForm((current) => ({
                                    ...current,
                                    workingHours: event.target.checked
                                        ? (current.workingHours || { enabled: true, start: '09:00', end: '18:00', timezone: 'Africa/Mogadishu' })
                                        : null,
                                }))}
                            />
                            Restrict AI replies to working hours
                        </label>
                        {workingHoursEnabled && (
                            <>
                                <div className="input-group">
                                    <label>Start time</label>
                                    <input
                                        type="time"
                                        className="input"
                                        value={automationForm.workingHours?.start || '09:00'}
                                        onChange={(event) => setAutomationForm((current) => ({
                                            ...current,
                                            workingHours: {
                                                enabled: true,
                                                start: event.target.value,
                                                end: current.workingHours?.end || '18:00',
                                                timezone: current.workingHours?.timezone || 'Africa/Mogadishu',
                                            },
                                        }))}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>End time</label>
                                    <input
                                        type="time"
                                        className="input"
                                        value={automationForm.workingHours?.end || '18:00'}
                                        onChange={(event) => setAutomationForm((current) => ({
                                            ...current,
                                            workingHours: {
                                                enabled: true,
                                                start: current.workingHours?.start || '09:00',
                                                end: event.target.value,
                                                timezone: current.workingHours?.timezone || 'Africa/Mogadishu',
                                            },
                                        }))}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Timezone</label>
                                    <input
                                        className="input"
                                        value={automationForm.workingHours?.timezone || 'Africa/Mogadishu'}
                                        onChange={(event) => setAutomationForm((current) => ({
                                            ...current,
                                            workingHours: {
                                                enabled: true,
                                                start: current.workingHours?.start || '09:00',
                                                end: current.workingHours?.end || '18:00',
                                                timezone: event.target.value || 'Africa/Mogadishu',
                                            },
                                        }))}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Owner Activity</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                            <span className={`badge ${ownerActivity?.offline ? 'badge-danger' : 'badge-success'}`}>
                                {ownerActivity?.offline ? 'Offline' : 'Online'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Last activity</span>
                            <span>{ownerActivity?.lastActiveAt ? new Date(ownerActivity.lastActiveAt).toLocaleString() : 'Never'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Account</span>
                            <span>{user?.email}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Plan</span>
                            <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{tenant?.plan || 'free'}</span>
                        </div>
                    </div>
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-start' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? <span className="loading-spinner" /> : saved ? 'Saved' : 'Save Settings'}
                    </button>
                </div>
            </form>
        </DashboardLayout>
    );
}
