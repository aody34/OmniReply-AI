export const AUTO_REPLY_MODES = ['OFF', 'DELAYED', 'OFFLINE_ONLY', 'HYBRID'] as const;
export type AutoReplyMode = typeof AUTO_REPLY_MODES[number];

export type WorkingHoursConfig = {
    enabled?: boolean;
    start?: string;
    end?: string;
    timezone?: string;
};

export type TenantAutomationSettings = {
    autoReplyMode: AutoReplyMode;
    replyDelayMinutes: number;
    offlineGraceMinutes: number;
    workingHours: WorkingHoursConfig | null;
    enableHumanOverride: boolean;
    humanOverrideMinutes: number;
};

export type FlowConditionType =
    | 'containsText'
    | 'languageIs'
    | 'businessHoursOnly'
    | 'contactTag'
    | 'messageCountThreshold';

export type FlowActionType =
    | 'sendText'
    | 'sendTemplate'
    | 'addTag'
    | 'createLead'
    | 'updateLead'
    | 'callAIReply'
    | 'wait';

export type FlowConditionRecord = {
    id?: string;
    type: FlowConditionType;
    operator?: string | null;
    value?: any;
    sortOrder?: number | null;
};

export type FlowActionRecord = {
    id?: string;
    type: FlowActionType;
    config?: any;
    sortOrder?: number | null;
    templateId?: string | null;
};

export type AutomationFlowRecord = {
    id: string;
    tenantId: string;
    name: string;
    enabled: boolean;
    priority: number;
    Trigger?: { type: string; value?: any; config?: any } | null;
    Condition?: FlowConditionRecord[];
    Action?: FlowActionRecord[];
};

export type LeadSnapshot = {
    id?: string;
    phone: string;
    name?: string | null;
    tags?: string[] | null;
    messageCount?: number | null;
    humanOverrideUntil?: string | null;
};

export type StructuredAIReply = {
    replyText: string;
    confidence: number;
    tagsToAdd: string[];
    shouldCreateLead: boolean;
    language: 'so' | 'en';
    intent: string;
};

export type PendingReplySendAction = {
    type: 'sendText' | 'sendTemplate' | 'callAIReply';
    templateId?: string | null;
    text?: string;
    prompt?: string;
};

export type PendingReplyPlan = {
    addTags: string[];
    ensureLead: boolean;
    leadUpdates?: {
        name?: string | null;
        tags?: string[];
    };
    waitMinutes: number;
    send?: PendingReplySendAction;
};

export type PendingReplyPayload = {
    inboundMessage: string;
    detectedLanguage: 'so' | 'en';
    flowId?: string | null;
    plan: PendingReplyPlan;
};

export type FlowEvaluationContext = {
    phone: string;
    inboundMessage: string;
    detectedLanguage: 'so' | 'en';
    lead: LeadSnapshot | null;
    settings: TenantAutomationSettings;
    now?: Date;
};

export type FlowEvaluationResult = {
    sourceType: 'FLOW' | 'DEFAULT_AI';
    flowId?: string | null;
    plan: PendingReplyPlan;
};

export const DEFAULT_AUTOMATION_SETTINGS: TenantAutomationSettings = {
    autoReplyMode: 'DELAYED',
    replyDelayMinutes: 20,
    offlineGraceMinutes: 10,
    workingHours: null,
    enableHumanOverride: true,
    humanOverrideMinutes: 30,
};
