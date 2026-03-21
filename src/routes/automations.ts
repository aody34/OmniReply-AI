import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';
import type { FlowActionType, FlowConditionType } from '../lib/automation/types';
import supabase from '../lib/db';
import logger from '../lib/utils/logger';
import { getRouteRequestContext, getSafeErrorDetails, sendRouteError } from '../lib/utils/route-response';

const router = Router();

const flowConditionTypes = [
    'containsText',
    'languageIs',
    'businessHoursOnly',
    'contactTag',
    'messageCountThreshold',
] as const satisfies readonly FlowConditionType[];

const flowActionTypes = [
    'sendText',
    'sendTemplate',
    'addTag',
    'createLead',
    'updateLead',
    'callAIReply',
    'wait',
] as const satisfies readonly FlowActionType[];

const flowPayloadSchema = z.object({
    name: z.string().min(1).max(120),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).default(0),
    trigger: z.object({
        type: z.literal('INCOMING_MESSAGE').default('INCOMING_MESSAGE'),
        config: z.any().optional(),
    }).default({ type: 'INCOMING_MESSAGE' }),
    conditions: z.array(z.object({
        type: z.enum(flowConditionTypes),
        operator: z.string().min(1).optional().nullable(),
        value: z.any().optional(),
        sortOrder: z.number().int().optional().nullable(),
    })).default([]),
    actions: z.array(z.object({
        type: z.enum(flowActionTypes),
        config: z.any().optional(),
        sortOrder: z.number().int().optional().nullable(),
        templateId: z.string().uuid().optional().nullable(),
    })).default([]),
});

router.use(authMiddleware);

async function listFlows(tenantId: string) {
    const { data, error } = await supabase
        .from('AutomationFlow')
        .select('id, tenantId, name, enabled, priority, createdAt, updatedAt, Trigger:FlowTrigger(*), Condition:FlowCondition(*), Action:FlowAction(*)')
        .eq('tenantId', tenantId)
        .order('priority', { ascending: true });

    if (error) {
        throw error;
    }

    return (data || []).map((row: any) => ({
        ...row,
        Trigger: Array.isArray(row.Trigger) ? row.Trigger[0] || null : row.Trigger,
        Condition: Array.isArray(row.Condition) ? row.Condition : [],
        Action: Array.isArray(row.Action) ? row.Action : [],
    }));
}

async function replaceFlowChildren(tenantId: string, flowId: string, payload: z.infer<typeof flowPayloadSchema>) {
    const deleteConditionsRes = await supabase.from('FlowCondition').delete().eq('flowId', flowId).eq('tenantId', tenantId);
    if (deleteConditionsRes.error) {
        throw deleteConditionsRes.error;
    }

    const deleteActionsRes = await supabase.from('FlowAction').delete().eq('flowId', flowId).eq('tenantId', tenantId);
    if (deleteActionsRes.error) {
        throw deleteActionsRes.error;
    }

    const deleteTriggerRes = await supabase.from('FlowTrigger').delete().eq('flowId', flowId).eq('tenantId', tenantId);
    if (deleteTriggerRes.error) {
        throw deleteTriggerRes.error;
    }

    const triggerPayload = {
        flowId,
        tenantId,
        type: payload.trigger.type,
        value: payload.trigger.config || null,
        config: payload.trigger.config || null,
        updatedAt: new Date().toISOString(),
    };
    const triggerRes = await supabase
        .from('FlowTrigger')
        .insert(triggerPayload)
        .select('*')
        .single();
    if (triggerRes.error || !triggerRes.data?.id) {
        throw triggerRes.error || new Error('Failed to create automation trigger');
    }
    const triggerId = triggerRes.data.id;

    if (payload.conditions.length) {
        const conditionRes = await supabase.from('FlowCondition').insert(payload.conditions.map((condition, index) => ({
            flowId,
            triggerId,
            tenantId,
            type: condition.type,
            operator: condition.operator || null,
            value: condition.value ?? null,
            sortOrder: condition.sortOrder ?? index,
            updatedAt: new Date().toISOString(),
        })));
        if (conditionRes.error) {
            throw conditionRes.error;
        }
    }

    if (payload.actions.length) {
        const actionRes = await supabase.from('FlowAction').insert(payload.actions.map((action, index) => ({
            flowId,
            tenantId,
            type: action.type,
            config: action.config ?? null,
            sortOrder: action.sortOrder ?? index,
            templateId: action.templateId || null,
            updatedAt: new Date().toISOString(),
        })));
        if (actionRes.error) {
            throw actionRes.error;
        }
    }
}

router.get('/', async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'automations.list');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling automation list');

        const flows = await listFlows(req.auth.tenantId);
        res.json({ flows });
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to fetch automations');
        logger.error({ ...ctx, details }, 'Automation list failed');
        return sendRouteError(res, 500, 'AUTOMATION_LIST_FAILED', details, ctx.requestId);
    }
});

router.post('/', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'automations.create');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling automation create');

        assertNoTenantOverride(req.body);
        const tenantId = req.auth.tenantId;
        const payload = flowPayloadSchema.parse(req.body);
        const normalizedPayload = {
            ...payload,
            trigger: payload.trigger || { type: 'INCOMING_MESSAGE' as const },
        };

        const { data: flow, error } = await supabase
            .from('AutomationFlow')
            .insert({
                tenantId,
                name: normalizedPayload.name,
                enabled: normalizedPayload.enabled,
                priority: normalizedPayload.priority,
                updatedAt: new Date().toISOString(),
            })
            .select('*')
            .single();

        if (error || !flow) {
            throw error || new Error('Failed to create automation flow');
        }

        await replaceFlowChildren(tenantId, flow.id, normalizedPayload);
        const flows = await listFlows(tenantId);
        const created = flows.find((entry) => entry.id === flow.id);

        res.status(201).json({ flow: created });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return sendRouteError(res, 400, 'TENANT_OVERRIDE_BLOCKED', error.message, ctx.requestId);
        }
        if (error instanceof z.ZodError) {
            return sendRouteError(res, 400, 'AUTOMATION_CREATE_INVALID', error.issues[0]?.message || 'Invalid automation payload', ctx.requestId);
        }
        const details = getSafeErrorDetails(error, 'Failed to create automation');
        logger.error({ ...ctx, details }, 'Automation create failed');
        return sendRouteError(res, 500, 'AUTOMATION_CREATE_FAILED', details, ctx.requestId);
    }
});

router.put('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'automations.update');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling automation update');

        assertNoTenantOverride(req.body);
        const tenantId = req.auth.tenantId;
        const flowId = String(req.params.id);
        const payload = flowPayloadSchema.parse(req.body);
        const normalizedPayload = {
            ...payload,
            trigger: payload.trigger || { type: 'INCOMING_MESSAGE' as const },
        };

        const { data: existing, error: existingError } = await supabase
            .from('AutomationFlow')
            .select('id')
            .eq('id', flowId)
            .eq('tenantId', tenantId)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }
        if (!existing) {
            return sendRouteError(res, 404, 'AUTOMATION_NOT_FOUND', 'Automation not found', ctx.requestId);
        }

        const { error } = await supabase
            .from('AutomationFlow')
            .update({
                name: normalizedPayload.name,
                enabled: normalizedPayload.enabled,
                priority: normalizedPayload.priority,
                updatedAt: new Date().toISOString(),
            })
            .eq('id', flowId)
            .eq('tenantId', tenantId);

        if (error) {
            throw error;
        }

        await replaceFlowChildren(tenantId, flowId, normalizedPayload);
        const flows = await listFlows(tenantId);
        const updated = flows.find((entry) => entry.id === flowId);

        res.json({ flow: updated });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return sendRouteError(res, 400, 'TENANT_OVERRIDE_BLOCKED', error.message, ctx.requestId);
        }
        if (error instanceof z.ZodError) {
            return sendRouteError(res, 400, 'AUTOMATION_UPDATE_INVALID', error.issues[0]?.message || 'Invalid automation payload', ctx.requestId);
        }
        const details = getSafeErrorDetails(error, 'Failed to update automation');
        logger.error({ ...ctx, details }, 'Automation update failed');
        return sendRouteError(res, 500, 'AUTOMATION_UPDATE_FAILED', details, ctx.requestId);
    }
});

router.delete('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    const ctx = getRouteRequestContext(req, 'automations.delete');
    try {
        if (!req.auth?.tenantId) {
            return sendRouteError(res, 401, 'TENANT_CONTEXT_MISSING', 'Authenticated tenant context is required.', ctx.requestId);
        }

        logger.info({ ...ctx, hasUser: Boolean(ctx.userId), hasTenant: Boolean(ctx.tenantId) }, 'Handling automation delete');

        const tenantId = req.auth.tenantId;
        const flowId = String(req.params.id);

        const { error } = await supabase
            .from('AutomationFlow')
            .delete()
            .eq('id', flowId)
            .eq('tenantId', tenantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Automation deleted' });
    } catch (error) {
        const details = getSafeErrorDetails(error, 'Failed to delete automation');
        logger.error({ ...ctx, details }, 'Automation delete failed');
        return sendRouteError(res, 500, 'AUTOMATION_DELETE_FAILED', details, ctx.requestId);
    }
});

export default router;
