import type { CorsOptions } from 'cors';

export const DEFAULT_ALLOWED_ORIGINS = [
    'https://omni-reply-ai.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
];

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];

function normalizeOrigin(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol;
}

export function parseAllowedOrigins(rawValues: Array<string | undefined>): string[] {
    const parsed = rawValues
        .flatMap((raw) => (raw || '').split(','))
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean);

    return Array.from(new Set(parsed));
}

export function resolveAllowedOrigins(): string[] {
    const configured = parseAllowedOrigins([
        process.env.CORS_ORIGIN,
        process.env.CORS_ALLOWED_ORIGINS,
        process.env.FRONTEND_ORIGIN,
        process.env.FRONTEND_URL,
    ]);

    return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

export function createCorsOptions(allowedOrigins = resolveAllowedOrigins()): CorsOptions {
    return {
        origin(origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);

            const error = new Error('CORS origin not allowed');
            (error as Error & { status?: number }).status = 403;
            return callback(error);
        },
        methods: ALLOWED_METHODS,
        allowedHeaders: ALLOWED_HEADERS,
        credentials: true,
        optionsSuccessStatus: 204,
        preflightContinue: false,
    };
}
