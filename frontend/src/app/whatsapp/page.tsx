'use client';
// ============================================
// OmniReply AI — WhatsApp Connection Page
// ============================================

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/lib/api';

export default function WhatsAppPage() {
    const [status, setStatus] = useState<any>(null);
    const [qr, setQr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    const fetchStatus = async () => {
        try {
            const data = await api.whatsapp.status();
            setStatus(data.status);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleConnect = async () => {
        setLoading(true);
        setMsg('');
        try {
            const data = await api.whatsapp.connect();
            setMsg(data.message);
            // Poll for QR
            setTimeout(async () => {
                try {
                    const qrData = await api.whatsapp.qr();
                    setQr(qrData.qr);
                } catch { }
            }, 2000);
        } catch (err: any) {
            setMsg(err.message);
        } finally { setLoading(false); }
    };

    const handleDisconnect = async () => {
        setLoading(true);
        try {
            await api.whatsapp.disconnect();
            setMsg('Disconnected');
            setQr(null);
            fetchStatus();
        } catch (err: any) {
            setMsg(err.message);
        } finally { setLoading(false); }
    };

    const isConnected = status?.status === 'connected';

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">WhatsApp Connection</h1>
                    <p className="page-subtitle">Manage your WhatsApp business number</p>
                </div>
            </div>

            {/* Connection Status */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Connection Status</h3>
                        <span className={`badge ${isConnected ? 'badge-success' : 'badge-danger'}`}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: isConnected ? 'var(--status-online)' : 'var(--status-offline)',
                                display: 'inline-block',
                            }} />
                            {status?.status || 'disconnected'}
                        </span>
                        {status?.phoneNumber && (
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                                📞 {status.phoneNumber}
                            </p>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        {!isConnected ? (
                            <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
                                {loading ? <span className="loading-spinner" /> : '🔗 Connect'}
                            </button>
                        ) : (
                            <button className="btn btn-danger" onClick={handleDisconnect} disabled={loading}>
                                🔌 Disconnect
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* QR Code */}
            {qr && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>📱 Scan QR Code</h3>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                        Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                    </p>
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: 20,
                        display: 'inline-block', margin: '0 auto',
                    }}>
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`}
                            alt="WhatsApp QR Code"
                            width={250}
                            height={250}
                        />
                    </div>
                </div>
            )}

            {msg && (
                <div className="toast toast-success" style={{ position: 'relative', top: 0, right: 0, marginTop: 16 }}>
                    {msg}
                </div>
            )}

            {/* Instructions */}
            {!isConnected && !qr && (
                <div className="card" style={{ marginTop: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>🚀 How to Connect</h3>
                    <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                        <li>Click the <strong style={{ color: 'var(--accent)' }}>Connect</strong> button above</li>
                        <li>A QR code will appear — scan it with WhatsApp</li>
                        <li>Open WhatsApp → ⋮ Menu → <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
                        <li>Once connected, the AI will automatically respond to customer messages</li>
                    </ol>
                </div>
            )}
        </DashboardLayout>
    );
}
