import supabase from '../db';
import { isWithinWorkingHours } from './working-hours';
import type {
    AutomationFlowRecord,
    FlowActionRecord,
    FlowConditionRecord,
    FlowEvaluationContext,
    FlowEvaluationResult,
    PendingReplyPlan,
} from './types';

const DEFAULT_PLAN: PendingReplyPlan = {
    addTags: [],
    ensureLead: true,
    waitMinutes: 0,
    send: {
        type: 'callAIReply',
    },
};

function sortByOrder<T extends { sortOrder?: number | null }>(items: T[] | null | undefined): T[] {
    return [...(items || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return [];
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function matchesCondition(
    condition: FlowConditionRecord,
    context: FlowEvaluationContext,
): boolean {
    const message = context.inboundMessage.toLowerCase();
    const leadTags = (context.lead?.tags || []).map((tag) => tag.toLowerCase());

    switch (condition.type) {
        case 'containsText': {
            const needles = toStringArray(condition.value).map((entry) => entry.toLowerCase());
            if (!needles.length) {
                return true;
            }
            return needles.some((needle) => message.includes(needle));
        }
        case 'languageIs': {
            const languages = toStringArray(condition.value).map((entry) => entry.toLowerCase());
            if (!languages.length) {
                return true;
            }
            return languages.includes(context.detectedLanguage.toLowerCase());
        }
        case 'businessHoursOnly': {
            const enabled = condition.value === undefined ? true : Boolean(condition.value);
            if (!enabled) {
                return true;
            }
            return isWithinWorkingHours(context.settings.workingHours, context.now);
        }
        case 'contactTag': {
            const expectedTags = toStringArray(condition.value).map((entry) => entry.toLowerCase());
            if (!expectedTags.length) {
                return true;
            }
            return expectedTags.some((tag) => leadTags.includes(tag));
        }
        case 'messageCountThreshold': {
            const threshold = asNumber(condition.value) || 0;
            const count = context.lead?.messageCount || 0;
            switch (condition.operator) {
                case 'gt':
                    return count > threshold;
                case 'lt':
                    return count < threshold;
                case 'lte':
                    return count <= threshold;
                case 'eq':
                    return count === threshold;
                case 'gte':
                default:
                    return count >= threshold;
            }
        }
        default:
            return false;
    }
}

function buildPlan(actions: FlowActionRecord[]): PendingReplyPlan {
    const plan: PendingReplyPlan = {
        addTags: [],
        ensureLead: false,
        waitMinutes: 0,
    };

    for (const action of sortByOrder(actions)) {
        const config = action.config || {};

        switch (action.type) {
            case 'addTag': {
                const tags = [
                    ...toStringArray(config.tags),
                    ...toStringArray(config.tag),
                ];
                plan.addTags = Array.from(new Set([...plan.addTags, ...tags]));
                break;
            }
            case 'createLead':
                plan.ensureLead = true;
                break;
            case 'updateLead': {
                plan.ensureLead = true;
                plan.leadUpdates = {
                    ...plan.leadUpdates,
                    name: typeof config.name === 'string' ? config.name.trim() || null : plan.leadUpdates?.name,
                    tags: Array.from(new Set([
                        ...(plan.leadUpdates?.tags || []),
                        ...toStringArray(config.tags),
                    ])),
                };
                break;
            }
            case 'wait': {
                const waitMinutes = asNumber(config.minutes) || asNumber(config.delayMinutes) || 0;
                plan.waitMinutes += Math.max(0, waitMinutes);
                break;
            }
            case 'sendText': {
                const text = typeof config.text === 'string' ? config.text.trim() : '';
                if (text) {
                    plan.send = {
                        type: 'sendText',
                        text,
                    };
                }
                break;
            }
            case 'sendTemplate': {
                const templateId = action.templateId || config.templateId || null;
                if (templateId) {
                    plan.send = {
                        type: 'sendTemplate',
                        templateId,
                    };
                }
                break;
            }
            case 'callAIReply': {
                const prompt = typeof config.prompt === 'string' ? config.prompt.trim() : undefined;
                plan.send = {
                    type: 'callAIReply',
                    prompt,
                };
                break;
            }
            default:
                break;
        }
    }

    return plan;
}

function flowMatches(flow: AutomationFlowRecord, context: FlowEvaluationContext): boolean {
    if (!flow.enabled) {
        return false;
    }

    if (flow.Trigger?.type && flow.Trigger.type !== 'INCOMING_MESSAGE') {
        return false;
    }

    return sortByOrder(flow.Condition).every((condition) => matchesCondition(condition, context));
}

export async function loadTenantFlows(tenantId: string): Promise<AutomationFlowRecord[]> {
    const { data, error } = await supabase
        .from('AutomationFlow')
        .select('id, tenantId, name, enabled, priority, Trigger:FlowTrigger(*), Condition:FlowCondition(*), Action:FlowAction(*)')
        .eq('tenantId', tenantId)
        .eq('enabled', true)
        .order('priority', { ascending: true });

    if (error) {
        throw error;
    }

    return (data || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        enabled: Boolean(row.enabled),
        priority: row.priority || 0,
        Trigger: Array.isArray(row.Trigger) ? row.Trigger[0] || null : row.Trigger,
        Condition: Array.isArray(row.Condition) ? row.Condition : [],
        Action: Array.isArray(row.Action) ? row.Action : [],
    }));
}

export async function evaluateTenantFlows(
    tenantId: string,
    context: FlowEvaluationContext,
): Promise<FlowEvaluationResult> {
    const flows = await loadTenantFlows(tenantId);

    for (const flow of flows) {
        if (!flowMatches(flow, context)) {
            continue;
        }

        return {
            sourceType: 'FLOW',
            flowId: flow.id,
            plan: buildPlan(flow.Action || []),
        };
    }

    return {
        sourceType: 'DEFAULT_AI',
        flowId: null,
        plan: DEFAULT_PLAN,
    };
}

export function evaluateLoadedFlows(
    flows: AutomationFlowRecord[],
    context: FlowEvaluationContext,
): FlowEvaluationResult {
    for (const flow of flows) {
        if (!flowMatches(flow, context)) {
            continue;
        }

        return {
            sourceType: 'FLOW',
            flowId: flow.id,
            plan: buildPlan(flow.Action || []),
        };
    }

    return {
        sourceType: 'DEFAULT_AI',
        flowId: null,
        plan: DEFAULT_PLAN,
    };
}
