// ============================================
// OmniReply AI — Google Gemini Integration
// AI provider abstraction with context injection
// ============================================

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { AIResponse } from '../../types';
import logger from '../utils/logger';

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

/**
 * Initialize the Gemini client
 */
function getModel(): GenerativeModel {
    if (!model) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set in environment variables');
        }
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
    return model;
}

/**
 * Build the system prompt with tenant context and language instruction
 */
function buildSystemPrompt(
    businessName: string,
    businessType: string,
    knowledgeContext: string,
    languageInstruction: string
): string {
    return `You are a professional, friendly AI customer service assistant for "${businessName}" (a ${businessType}).

## YOUR ROLE
- You represent this business and help customers with their inquiries
- You answer questions about products, services, prices, hours, and policies
- You are polite, helpful, and concise
- You ONLY provide information from the business knowledge base below
- If you don't know something, say you'll have the owner follow up
- NEVER make up information — only use what's provided

## LANGUAGE
${languageInstruction}

## BUSINESS KNOWLEDGE BASE
${knowledgeContext || 'No specific business data provided yet. Respond politely and let them know the owner will get back to them.'}

## RULES
1. Keep responses concise and conversational (WhatsApp style, not formal emails)
2. Use appropriate emojis sparingly to feel friendly 😊
3. If asked about something not in the knowledge base, say: "Let me check with the team and get back to you shortly!"
4. Format prices and lists clearly
5. Never reveal that you are an AI unless directly asked
6. Be respectful of cultural context — many customers speak Somali`;
}

/**
 * Generate an AI response using Gemini Pro
 */
export async function generateResponse(
    userMessage: string,
    businessName: string,
    businessType: string,
    knowledgeContext: string,
    languageInstruction: string,
    entriesUsed: string[]
): Promise<AIResponse> {
    try {
        const gemini = getModel();

        const systemPrompt = buildSystemPrompt(
            businessName,
            businessType,
            knowledgeContext,
            languageInstruction
        );

        const prompt = `${systemPrompt}\n\n## CUSTOMER MESSAGE\n"${userMessage}"\n\nRespond naturally as the business assistant:`;

        logger.info({ businessName, messageLength: userMessage.length }, 'Sending to Gemini Pro');

        const result = await gemini.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        if (!text) {
            throw new Error('Empty response from Gemini');
        }

        logger.info({ responseLength: text.length, entriesUsed }, 'Gemini response generated');

        return {
            content: text.trim(),
            language: languageInstruction.includes('Somali') ? 'so' : 'en',
            knowledgeUsed: entriesUsed,
        };
    } catch (err: any) {
        logger.error({ error: err.message }, 'Gemini API error');

        // Graceful fallback
        return {
            content: languageInstruction.includes('Somali')
                ? 'Waan ka xumahay, haddii aad sugtid waan kugu soo jawaabi doonaa. Mahadsanid! 🙏'
                : 'Sorry, let me check on that and get back to you shortly. Thank you for your patience! 🙏',
            language: languageInstruction.includes('Somali') ? 'so' : 'en',
            knowledgeUsed: [],
        };
    }
}
