'use client';
// ============================================
// OmniReply AI — Dashboard Layout (with Sidebar)
// Wraps all authenticated pages
// ============================================

import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

const HEARTBEAT_INTERVAL_MS = 60_000;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (!user) {
            return;
        }

        const sendHeartbeat = () => {
            api.heartbeat.ping().catch(() => {
                // Heartbeat should not disrupt the UI.
            });
        };

        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [user]);

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', background: 'var(--bg-primary)'
            }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <main style={{
                flex: 1,
                marginLeft: 'var(--sidebar-width)',
                padding: '28px 32px',
                minHeight: '100vh',
            }}>
                {children}
            </main>
        </div>
    );
}
