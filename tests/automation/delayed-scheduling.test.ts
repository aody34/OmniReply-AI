import { describe, expect, it } from 'vitest';
import { computeInitialScheduledAt } from '../../src/lib/automation/pending-replies';
import type { PendingReplyPlan, TenantAutomationSettings } from '../../src/lib/automation/types';

const basePlan: PendingReplyPlan = {
    addTags: [],
    ensureLead: true,
    waitMinutes: 0,
    send: { type: 'callAIReply' },
};

const baseSettings: TenantAutomationSettings = {
    autoReplyMode: 'DELAYED',
    replyDelayMinutes: 20,
    offlineGraceMinutes: 10,
    workingHours: null,
    enableHumanOverride: true,
    humanOverrideMinutes: 30,
};

describe('pending reply scheduling', () => {
    it('uses delay + flow wait for delayed mode', () => {
        const now = new Date('2026-03-11T10:00:00.000Z');
        const scheduledAt = computeInitialScheduledAt(baseSettings, { ...basePlan, waitMinutes: 5 }, now);
        expect(scheduledAt.toISOString()).toBe('2026-03-11T10:25:00.000Z');
    });

    it('uses zero base delay for offline-only mode', () => {
        const now = new Date('2026-03-11T10:00:00.000Z');
        const scheduledAt = computeInitialScheduledAt({ ...baseSettings, autoReplyMode: 'OFFLINE_ONLY' }, basePlan, now);
        expect(scheduledAt.toISOString()).toBe('2026-03-11T10:00:00.000Z');
    });

    it('keeps hybrid delay behavior at schedule time', () => {
        const now = new Date('2026-03-11T10:00:00.000Z');
        const scheduledAt = computeInitialScheduledAt({ ...baseSettings, autoReplyMode: 'HYBRID', replyDelayMinutes: 12 }, basePlan, now);
        expect(scheduledAt.toISOString()).toBe('2026-03-11T10:12:00.000Z');
    });
});
