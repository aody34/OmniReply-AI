import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';

const WEBHOOK_BODY_LIMIT = process.env.WEBHOOK_BODY_LIMIT || '1mb';

function resolveWebhookSecret(): string | null {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
        return null;
    }

    return secret;
}

function extractSignature(req: Request): string | null {
    const candidate = req.header('x-webhook-signature')
        || req.header('x-signature')
        || req.header('x-evolution-signature');

    if (!candidate) {
        return null;
    }

    return candidate.replace(/^sha256=/i, '').trim();
}

export const rawWebhookBody = express.raw({
    limit: WEBHOOK_BODY_LIMIT,
    type: 'application/json',
});

export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
    const secret = resolveWebhookSecret();
    if (!secret) {
        res.status(503).json({ error: 'Webhook verification is not configured on the backend' });
        return;
    }

    const signature = extractSignature(req);
    if (!signature || !Buffer.isBuffer(req.body)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(req.body)
        .digest('hex');

    const received = Buffer.from(signature, 'hex');
    const computed = Buffer.from(expected, 'hex');

    if (received.length !== computed.length || !crypto.timingSafeEqual(received, computed)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
    }

    next();
}
