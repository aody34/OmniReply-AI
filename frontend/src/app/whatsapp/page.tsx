'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api, WhatsAppStatusPayload } from '@/lib/api';
import {
    formatWhatsAppState,
    getWhatsAppStatusView,
    shouldShowDisconnect,
    shouldAcceptStatusResponse,
    shouldShowRetry,
} from '@/lib/whatsapp-status';

export default function WhatsAppPage() {
    const [status, setStatus] = useState<WhatsAppStatusPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [lastStatusFetchAt, setLastStatusFetchAt] = useState<string | null>(null);
    const [waitingSinceMs, setWaitingSinceMs] = useState<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);
    const latestAppliedRequestIdRef = useRef(0);

    const applyStatus = useCallback((next: WhatsAppStatusPayload, requestId: number) => {
        setStatus((current) => {
            if (!shouldAcceptStatusResponse({
                current,
                next,
                requestId,
                latestAppliedRequestId: latestAppliedRequestIdRef.current,
            })) {
                return current;
            }

            latestAppliedRequestIdRef.current = requestId;
            return next;
        });
    }, []);

    const pollStatus = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++requestIdRef.current;

        try {
            const next = await api.whatsapp.status({
                signal: controller.signal,
                cache: 'no-store',
            });
            setLastStatusFetchAt(new Date().toISOString());
            applyStatus(next, requestId);
        } catch (error: any) {
            if (controller.signal.aborted) {
                return;
            }
            setMessage(error.message || 'Failed to fetch WhatsApp status');
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, [applyStatus]);

    useEffect(() => {
        void pollStatus();
    }, [pollStatus]);

    useEffect(() => {
        const shouldPoll = !status || status.state === 'CONNECTING' || status.state === 'QR';
        if (!shouldPoll) {
            return;
        }

        const interval = window.setInterval(() => {
            void pollStatus();
        }, 2000);

        return () => {
            window.clearInterval(interval);
        };
    }, [pollStatus, status?.state]);

    useEffect(() => {
        const waitingForQr = !status || status.state === 'CONNECTING' || (status.state === 'QR' && !status.qr);
        if (waitingForQr) {
            setWaitingSinceMs((current) => current ?? Date.now());
            return;
        }

        setWaitingSinceMs(null);
    }, [status?.state, status?.qr]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const handleConnect = async (force = false) => {
        setLoading(true);
        setMessage('');
        try {
            const data = await api.whatsapp.connect(force ? { force: true } : undefined);
            setMessage(data.message);
            if (data.status) {
                latestAppliedRequestIdRef.current = requestIdRef.current;
                setStatus(data.status);
            }
            await pollStatus();
        } catch (error: any) {
            setMessage(error.message || 'Failed to connect WhatsApp');
            await pollStatus();
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setLoading(true);
        setMessage('');
        try {
            const data = await api.whatsapp.disconnect();
            setMessage(data.message || 'WhatsApp disconnected');
            if (data.status) {
                latestAppliedRequestIdRef.current = requestIdRef.current;
                setStatus(data.status);
            }
            await pollStatus();
        } catch (error: any) {
            setMessage(error.message || 'Failed to disconnect WhatsApp');
            await pollStatus();
        } finally {
            setLoading(false);
        }
    };

    const view = getWhatsAppStatusView(status);
    const stateLabel = formatWhatsAppState(status?.state);
    const showDisconnect = shouldShowDisconnect(status);
    const showRetry = shouldShowRetry(status, waitingSinceMs);

    return (
        <DashboardLayout>
            <div className="page-header">
                <div>
                    <h1 className="page-title">WhatsApp Connection</h1>
                    <p className="page-subtitle">Manage your WhatsApp business number from one canonical backend session state.</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Connection Status</h3>
                        <span className={`badge ${view.isConnected ? 'badge-success' : status?.state === 'ERROR' ? 'badge-danger' : 'badge-info'}`}>
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: view.isConnected
                                        ? 'var(--status-online)'
                                        : status?.state === 'ERROR'
                                            ? 'var(--status-offline)'
                                            : 'var(--accent)',
                                    display: 'inline-block',
                                }}
                            />
                            {stateLabel}
                        </span>
                        {status?.phoneNumber && (
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                                📞 {status.phoneNumber}
                            </p>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        {showDisconnect ? (
                            <button className="btn btn-danger" onClick={handleDisconnect} disabled={loading}>
                                {loading ? <span className="loading-spinner" /> : 'Disconnect'}
                            </button>
                        ) : status?.state === 'DISCONNECTED' || status?.state === 'ERROR' || !status ? (
                            <button className="btn btn-primary" onClick={() => handleConnect()} disabled={loading}>
                                {loading ? <span className="loading-spinner" /> : 'Connect'}
                            </button>
                        ) : showRetry ? (
                            <button className="btn btn-primary" onClick={() => handleConnect(true)} disabled={loading}>
                                {loading ? <span className="loading-spinner" /> : 'Retry QR'}
                            </button>
                        ) : (
                            <button className="btn btn-secondary" disabled>
                                Waiting...
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {view.isError && (
                <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(239, 68, 68, 0.35)', background: 'rgba(127, 29, 29, 0.22)' }}>
                    <strong style={{ display: 'block', marginBottom: 8 }}>WhatsApp needs attention</strong>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        {status?.reason || 'Temporary WhatsApp login issue. Please try connecting again.'}
                    </p>
                </div>
            )}

            {view.isQrReady && status?.qr && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Scan QR Code</h3>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                        Open WhatsApp on your phone, go to Linked Devices, and scan this code.
                    </p>
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: 20,
                            display: 'inline-block',
                            margin: '0 auto',
                        }}
                    >
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(status.qr)}`}
                            alt="WhatsApp QR code"
                            width={250}
                            height={250}
                        />
                    </div>
                </div>
            )}

            {view.isConnected && (
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>WhatsApp is connected</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Your backend session is live. QR codes are cleared as soon as the device is linked.
                    </p>
                </div>
            )}

            {view.isConnecting && !view.isQrReady && (
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Waiting for QR</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Waiting for the backend to receive a QR event. The page refreshes automatically every 2 seconds.
                    </p>
                    {showRetry && (
                        <div style={{ marginTop: 16 }}>
                            <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>
                                No QR arrived within 10 seconds. Try a fresh QR generation.
                            </p>
                            <button className="btn btn-primary" onClick={() => handleConnect(true)} disabled={loading}>
                                {loading ? <span className="loading-spinner" /> : 'Retry QR'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {view.isDisconnected && (
                <div className="card" style={{ marginTop: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>How to connect</h3>
                    <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                        <li>Click the Connect button above.</li>
                        <li>A QR code will appear only when the backend receives a fresh QR event.</li>
                        <li>Open WhatsApp, go to Linked Devices, and scan the code.</li>
                        <li>After linking, the UI switches to Connected based on backend session state.</li>
                    </ol>
                </div>
            )}

            {message && (
                <div className="toast toast-success" style={{ position: 'relative', top: 0, right: 0, marginTop: 16 }}>
                    {message}
                </div>
            )}

            <details style={{ marginTop: 24, opacity: 0.85 }}>
                <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Debug</summary>
                <div className="card" style={{ marginTop: 12 }}>
                    <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                        <div><strong>state:</strong> {status?.state || 'DISCONNECTED'}</div>
                        <div><strong>updatedAt:</strong> {status?.updatedAt || '—'}</div>
                        <div><strong>qrCreatedAt:</strong> {status?.qrCreatedAt || '—'}</div>
                        <div><strong>qr present:</strong> {status?.qr ? 'true' : 'false'}</div>
                        <div><strong>last status fetch:</strong> {lastStatusFetchAt || '—'}</div>
                        <div><strong>serverTime:</strong> {status?.serverTime || '—'}</div>
                        <div><strong>reason:</strong> {status?.reason || '—'}</div>
                    </div>
                </div>
            </details>
        </DashboardLayout>
    );
}
