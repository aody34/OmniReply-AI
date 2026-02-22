'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import styles from '../login/auth.module.css';

export default function RegisterPage() {
    const { register } = useAuth();
    const [form, setForm] = useState({ email: '', password: '', name: '', businessName: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await register(form);
        } catch (err: any) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.authPage}>
            <div className={styles.authCard}>
                <div className={styles.authLogo}>⚡</div>
                <h1 className={styles.authTitle}>Create your account</h1>
                <p className={styles.authSubtitle}>Start automating your WhatsApp customer service</p>

                {error && <div className={styles.authError}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.authForm}>
                    <div className="input-group">
                        <label>Your Name</label>
                        <input type="text" className="input" placeholder="Abdulkadir"
                            value={form.name} onChange={e => update('name', e.target.value)} required />
                    </div>

                    <div className="input-group">
                        <label>Business Name</label>
                        <input type="text" className="input" placeholder="My Shop"
                            value={form.businessName} onChange={e => update('businessName', e.target.value)} required />
                    </div>

                    <div className="input-group">
                        <label>Email</label>
                        <input type="email" className="input" placeholder="you@business.com"
                            value={form.email} onChange={e => update('email', e.target.value)} required />
                    </div>

                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" className="input" placeholder="Min 6 characters"
                            value={form.password} onChange={e => update('password', e.target.value)} required minLength={6} />
                    </div>

                    <button type="submit" className="btn btn-primary btn-lg" disabled={loading}
                        style={{ width: '100%', justifyContent: 'center' }}>
                        {loading ? <span className="loading-spinner" /> : 'Create Account'}
                    </button>
                </form>

                <p className={styles.authFooter}>
                    Already have an account? <Link href="/login">Sign in</Link>
                </p>
            </div>
            <div className={styles.authDecor}><div className={styles.decorGlow} /></div>
        </div>
    );
}
