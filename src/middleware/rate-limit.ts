import rateLimit from 'express-rate-limit';

const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const DEFAULT_AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);
const DEFAULT_WHATSAPP_RATE_LIMIT_WINDOW_MS = Number(process.env.WHATSAPP_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const DEFAULT_WHATSAPP_RATE_LIMIT_MAX = Number(process.env.WHATSAPP_RATE_LIMIT_MAX || 5);

export function createAuthRateLimiter(
    overrides: Partial<Parameters<typeof rateLimit>[0]> = {},
) {
    return rateLimit({
        windowMs: DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
        max: DEFAULT_AUTH_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many authentication attempts. Please try again later.' },
        ...overrides,
    });
}

export function createWhatsAppRateLimiter(
    overrides: Partial<Parameters<typeof rateLimit>[0]> = {},
) {
    return rateLimit({
        windowMs: DEFAULT_WHATSAPP_RATE_LIMIT_WINDOW_MS,
        max: DEFAULT_WHATSAPP_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many WhatsApp connection attempts. Please try again later.' },
        ...overrides,
    });
}
