import { describe, expect, it } from 'vitest';
import { isOwnerOffline } from '../../src/lib/automation/owner-activity';

describe('offline detection', () => {
    it('treats missing activity as offline', () => {
        expect(isOwnerOffline(null, 10, new Date('2026-03-11T10:00:00.000Z'))).toBe(true);
    });

    it('treats recent activity as online', () => {
        expect(isOwnerOffline('2026-03-11T09:55:30.000Z', 10, new Date('2026-03-11T10:00:00.000Z'))).toBe(false);
    });

    it('treats stale activity as offline', () => {
        expect(isOwnerOffline('2026-03-11T09:40:00.000Z', 10, new Date('2026-03-11T10:00:00.000Z'))).toBe(true);
    });
});
