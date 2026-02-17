'use client';
// ============================================
// OmniReply AI — Dashboard Page
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tenant.dashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back! Here&apos;s your overview.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid-4" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-icon">💬</div>
          <div className="stat-value">{data?.today?.messagesIn || 0}</div>
          <div className="stat-label">Messages Received Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🤖</div>
          <div className="stat-value">{data?.today?.aiResponses || 0}</div>
          <div className="stat-label">AI Responses Sent</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{data?.totalLeads || 0}</div>
          <div className="stat-label">Total Leads</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📢</div>
          <div className="stat-value">{data?.today?.messagesOut || 0}</div>
          <div className="stat-label">Messages Sent Today</div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid-2">
        {/* WhatsApp Status */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            📱 WhatsApp Status
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`badge ${data?.whatsappStatus?.status === 'connected'
              ? 'badge-success' : 'badge-danger'}`}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: data?.whatsappStatus?.status === 'connected'
                  ? 'var(--status-online)' : 'var(--status-offline)',
                display: 'inline-block',
              }} />
              {data?.whatsappStatus?.status || 'disconnected'}
            </span>
          </div>
          {data?.whatsappStatus?.status !== 'connected' && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
              Go to WhatsApp page to connect your number.
            </p>
          )}
        </div>

        {/* Business Info */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            🏢 Business Info
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Business</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{data?.tenant?.name || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Plan</span>
              <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                {data?.tenant?.plan || 'free'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
