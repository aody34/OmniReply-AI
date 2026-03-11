import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { requestDbMiddleware } from '../middleware/request-db';
import { assertNoTenantOverride, TenantOverrideError } from '../lib/request-db';
import { AUTO_REPLY_MODES, type FlowActionType, type FlowConditionType } from '../lib/automation/types';

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
router.use(requestDbMiddleware);

async function listFlows(db: NonNullable<Request['tenantDb']>, tenantId: string) {
    const { data, error } = await db
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

async function replaceFlowChildren(db: NonNullable<Request['tenantDb']>, tenantId: string, flowId: string, payload: z.infer<typeof flowPayloadSchema>) {
    await Promise.all([
        db.from('FlowTrigger').delete().eq('flowId', flowId).eq('tenantId', tenantId),
        db.from('FlowCondition').delete().eq('flowId', flowId).eq('tenantId', tenantId),
        db.from('FlowAction').delete().eq('flowId', flowId).eq('tenantId', tenantId),
    ]);

    const triggerPayload = {
        flowId,
        tenantId,
        type: payload.trigger.type,
        config: payload.trigger.config || null,
    };
    const triggerRes = await db.from('FlowTrigger').insert(triggerPayload);
    if (triggerRes.error) {
        throw triggerRes.error;
    }

    if (payload.conditions.length) {
        const conditionRes = await db.from('FlowCondition').insert(payload.conditions.map((condition, index) => ({
            flowId,
            tenantId,
            type: condition.type,
            operator: condition.operator || null,
            value: condition.value ?? null,
            sortOrder: condition.sortOrder ?? index,
        })));
        if (conditionRes.error) {
            throw conditionRes.error;
        }
    }

    if (payload.actions.length) {
        const actionRes = await db.from('FlowAction').insert(payload.actions.map((action, index) => ({
            flowId,
            tenantId,
            type: action.type,
            config: action.config ?? null,
            sortOrder: action.sortOrder ?? index,
            templateId: action.templateId || null,
        })));
        if (actionRes.error) {
            throw actionRes.error;
        }
    }
}

router.get('/', async (req: Request, res: Response) => {
    try {
        const flows = await listFlows(req.tenantDb!, req.auth!.tenantId);
        res.json({ flows });
    } catch {
        res.status(500).json({ error: 'Failed to fetch automations' });
    }
});

router.post('/', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        assertNoTenantOverride(req.body);
        const db = req.tenantDb!;
        const tenantId = req.auth!.tenantId;
        const payload = flowPayloadSchema.parse(req.body);

        const { data: flow, error } = await db
            .from('AutomationFlow')
            .insert({
                tenantId,
                name: payload.name,
                enabled: payload.enabled,
                priority: payload.priority,
            })
            .select('*')
            .single();

        if (error || !flow) {
            throw error || new Error('Failed to create automation flow');
        }

        await replaceFlowChildren(db, tenantId, flow.id, payload);
        const flows = await listFlows(db, tenantId);
        const created = flows.find((entry) => entry.id === flow.id);

        res.status(201).json({ flow: created });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0]?.message || 'Invalid automation payload' });
        }
        return res.status(500).json({ error: 'Failed to create automation' });
    }
});

router.put('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        assertNoTenantOverride(req.body);
        const db = req.tenantDb!;
        const tenantId = req.auth!.tenantId;
        const flowId = String(req.params.id);
        const payload = flowPayloadSchema.parse(req.body);

        const { data: existing, error: existingError } = await db
            .from('AutomationFlow')
            .select('id')
            .eq('id', flowId)
            .eq('tenantId', tenantId)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }
        if (!existing) {
            return res.status(404).json({ error: 'Automation not found' });
        }

        const { error } = await db
            .from('AutomationFlow')
            .update({
                name: payload.name,
                enabled: payload.enabled,
                priority: payload.priority,
                updatedAt: new Date().toISOString(),
            })
            .eq('id', flowId)
            .eq('tenantId', tenantId);

        if (error) {
            throw error;
        }

        await replaceFlowChildren(db, tenantId, flowId, payload);
        const flows = await listFlows(db, tenantId);
        const updated = flows.find((entry) => entry.id === flowId);

        res.json({ flow: updated });
    } catch (error) {
        if (error instanceof TenantOverrideError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0]?.message || 'Invalid automation payload' });
        }
        return res.status(500).json({ error: 'Failed to update automation' });
    }
});

router.delete('/:id', requireRole('owner', 'admin'), async (req: Request, res: Response) => {
    try {
        const db = req.tenantDb!;
        const tenantId = req.auth!.tenantId;
        const flowId = String(req.params.id);

        const { error } = await db
            .from('AutomationFlow')
            .delete()
            .eq('id', flowId)
            .eq('tenantId', tenantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Automation deleted' });
    } catch {
        res.status(500).json({ error: 'Failed to delete automation' });
    }
});

export default router;
