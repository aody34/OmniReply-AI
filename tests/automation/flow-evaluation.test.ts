import { describe, expect, it } from 'vitest';
import { evaluateLoadedFlows } from '../../src/lib/automation/flows';
import type { AutomationFlowRecord, FlowEvaluationContext, TenantAutomationSettings } from '../../src/lib/automation/types';

const settings: TenantAutomationSettings = {
    autoReplyMode: 'DELAYED',
    replyDelayMinutes: 20,
    offlineGraceMinutes: 10,
    workingHours: null,
    enableHumanOverride: true,
    humanOverrideMinutes: 30,
};

const context: FlowEvaluationContext = {
    phone: '252612345678',
    inboundMessage: 'Hi, can I get the price list today?',
    detectedLanguage: 'en',
    lead: {
        phone: '252612345678',
        tags: ['vip'],
        messageCount: 4,
    },
    settings,
    now: new Date('2026-03-11T10:00:00.000Z'),
};

const flows: AutomationFlowRecord[] = [
    {
        id: 'flow-price',
        tenantId: 'tenant-1',
        name: 'Price replies',
        enabled: true,
        priority: 0,
        Trigger: { type: 'INCOMING_MESSAGE' },
        Condition: [
            { type: 'containsText', value: ['price', 'cost'], sortOrder: 0 },
            { type: 'languageIs', value: 'en', sortOrder: 1 },
        ],
        Action: [
            { type: 'addTag', config: { tags: ['pricing'] }, sortOrder: 0 },
            { type: 'wait', config: { minutes: 3 }, sortOrder: 1 },
            { type: 'sendText', config: { text: 'Our price list is available. We will send it shortly.' }, sortOrder: 2 },
        ],
    },
    {
        id: 'flow-fallback',
        tenantId: 'tenant-1',
        name: 'Fallback AI',
        enabled: true,
        priority: 1,
        Trigger: { type: 'INCOMING_MESSAGE' },
        Condition: [],
        Action: [{ type: 'callAIReply', config: { prompt: 'Reply helpfully.' }, sortOrder: 0 }],
    },
];

describe('flow evaluation', () => {
    it('returns the first matching flow and its plan', () => {
        const result = evaluateLoadedFlows(flows, context);
        expect(result.sourceType).toBe('FLOW');
        expect(result.flowId).toBe('flow-price');
        expect(result.plan.addTags).toEqual(['pricing']);
        expect(result.plan.waitMinutes).toBe(3);
        expect(result.plan.send?.type).toBe('sendText');
    });

    it('falls back to default AI when no flow matches', () => {
        const result = evaluateLoadedFlows([
            {
                ...flows[0],
                Condition: [{ type: 'languageIs', value: 'so', sortOrder: 0 }],
            },
        ], context);
        expect(result.sourceType).toBe('DEFAULT_AI');
        expect(result.plan.send?.type).toBe('callAIReply');
    });
});
