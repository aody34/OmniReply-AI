'use client';
// ============================================
// OmniReply AI — Auth Context Provider
// Manages login state across the app
// ============================================

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken, clearToken } from './api';
import { useRouter } from 'next/navigation';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
}

interface Tenant {
    id: string;
    name: string;
    plan: string;
    businessType: string;
}

interface AuthContextType {
    user: User | null;
    tenant: Tenant | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: { email: string; password: string; name: string; businessName: string }) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    tenant: null,
    loading: true,
    login: async () => { },
    register: async () => { },
    logout: () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Check auth on mount
    useEffect(() => {
        const token = localStorage.getItem('omnireply_token');
        if (token) {
            api.auth.me()
                .then(data => {
                    setUser(data.user);
                    setTenant(data.tenant);
                })
                .catch(() => {
                    clearToken();
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email: string, password: string) => {
        const data = await api.auth.login({ email, password });
        setToken(data.token);
        setUser(data.user);
        // Fetch tenant info
        const me = await api.auth.me();
        setTenant(me.tenant);
        router.push('/');
    };

    const register = async (data: { email: string; password: string; name: string; businessName: string }) => {
        const res = await api.auth.register(data);
        setToken(res.token);
        setUser(res.user);
        setTenant(res.tenant);
        router.push('/');
    };

    const logout = () => {
        clearToken();
        setUser(null);
        setTenant(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, tenant, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
