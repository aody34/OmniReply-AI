import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { z } from 'zod';
import supabase from '../db';
import logger from '../utils/logger';
import { detectLanguage, getLanguageInstruction } from '../utils/language';
import { queryKnowledgeBase } from '../ai/rag';
import type { StructuredAIReply } from './types';

const structuredAiReplySchema = z.object({
    replyText: z.string().min(1).max(2000),
    confidence: z.number().min(0).max(1),
    tagsToAdd: z.array(z.string().min(1).max(64)).max(10).default([]),
    shouldCreateLead: z.boolean().default(true),
    language: z.enum(['so', 'en']),
    intent: z.string().min(1).max(80),
});

let model: GenerativeModel | null = null;

function getGeminiModel(): GenerativeModel {
    if (model) {
        return model;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    const client = new GoogleGenerativeAI(apiKey);
    model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    return model;
}

function extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(trimmed.slice(start, end + 1));
        }
        throw new Error('Model response did not contain valid JSON');
    }
}

export function buildLowConfidenceFallback(language: 'so' | 'en'): string {
    return language === 'so'
        ? 'Mahadsanid! Waan hubinayaa kadib ayaan kuu soo jawaabi doonaa.'
        : 'Thanks! I\'ll check and reply soon.';
}

function buildPrompt(input: {
    businessName: string;
    businessType: string;
    message: string;
    knowledgeContext: string;
    language: 'so' | 'en';
    extraPrompt?: string;
}): string {
    const languageInstruction = getLanguageInstruction(input.language);

    return [
        `You are a WhatsApp automation assistant for ${input.businessName}, a ${input.businessType || 'general'} business.`,
        'Return JSON only. Do not wrap it in markdown.',
        'Use the knowledge base facts when relevant. If unsure, keep the reply short and conservative.',
        'JSON schema:',
        JSON.stringify({
            replyText: 'string',
            confidence: 0.82,
            tagsToAdd: ['faq'],
            shouldCreateLead: true,
            language: input.language,
            intent: 'pricing_question',
        }),
        `Language guidance: ${languageInstruction}`,
        input.extraPrompt ? `Automation prompt: ${input.extraPrompt}` : '',
        `Knowledge base:\n${input.knowledgeContext || 'No relevant knowledge found. If uncertain, say the owner will follow up.'}`,
        `Customer message:\n${input.message}`,
        'Constraints:',
        '- Keep replyText concise and WhatsApp-friendly.',
        '- Do not invent prices or policies.',
        '- confidence must be 0 to 1.',
        '- tagsToAdd should be short labels.',
    ].filter(Boolean).join('\n\n');
}

export async function generateStructuredAIReply(input: {
    tenantId: string;
    message: string;
    prompt?: string;
}): Promise<StructuredAIReply> {
    const language = detectLanguage(input.message);
    const fallbackLanguage = language === 'so' ? 'so' : 'en';

    try {
        const [{ data: tenant, error: tenantError }, ragResult] = await Promise.all([
            supabase
                .from('Tenant')
                .select('name, businessType')
                .eq('id', input.tenantId)
                .maybeSingle(),
            queryKnowledgeBase(input.tenantId, input.message),
        ]);

        if (tenantError) {
            throw tenantError;
        }

        const gemini = getGeminiModel();
        const prompt = buildPrompt({
            businessName: tenant?.name || 'this business',
            businessType: tenant?.businessType || 'general',
            message: input.message,
            knowledgeContext: ragResult.context,
            language: fallbackLanguage,
            extraPrompt: input.prompt,
        });

        logger.info({ tenantId: input.tenantId, promptConfigured: Boolean(input.prompt) }, 'Generating structured Gemini reply');
        const result = await gemini.generateContent(prompt);
        const rawText = result.response.text();
        const parsed = structuredAiReplySchema.parse(extractJson(rawText));

        if (parsed.confidence < 0.45) {
            return {
                ...parsed,
                replyText: buildLowConfidenceFallback(parsed.language),
            };
        }

        return parsed;
    } catch (error) {
        logger.error({ error, tenantId: input.tenantId }, 'Structured AI reply generation failed');
        return {
            replyText: buildLowConfidenceFallback(fallbackLanguage),
            confidence: 0,
            tagsToAdd: [],
            shouldCreateLead: true,
            language: fallbackLanguage,
            intent: 'fallback',
        };
    }
}
