'use client';
// ============================================
// OmniReply AI — Sidebar Navigation
// ============================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import styles from './Sidebar.module.css';

const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/whatsapp', label: 'WhatsApp', icon: '💬' },
    { href: '/automations', label: 'Automations', icon: '🧩' },
    { href: '/templates', label: 'Templates', icon: '📝' },
    { href: '/knowledge', label: 'Knowledge Base', icon: '📚' },
    { href: '/leads', label: 'Leads / CRM', icon: '👥' },
    { href: '/broadcasts', label: 'Broadcasts', icon: '📢' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, tenant, logout } = useAuth();

    return (
        <aside className={styles.sidebar}>
            <div className={styles.brand}>
                <div className={styles.logo}>⚡</div>
                <div>
                    <div className={styles.brandName}>OmniReply AI</div>
                    <div className={styles.tenantName}>{tenant?.name || 'Loading...'}</div>
                </div>
            </div>

            <nav className={styles.nav}>
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                    >
                        <span className={styles.navIcon}>{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            <div className={styles.userSection}>
                <div className={styles.userInfo}>
                    <div className={styles.avatar}>
                        {user?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                        <div className={styles.userName}>{user?.name}</div>
                        <div className={styles.userRole}>{user?.role}</div>
                    </div>
                </div>
                <button className={styles.logoutBtn} onClick={logout} title="Sign out">
                    ↪
                </button>
            </div>
        </aside>
    );
}
