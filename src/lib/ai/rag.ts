// ============================================
// OmniReply AI — RAG Pipeline (Supabase JS)
// Retrieval-Augmented Generation from tenant knowledge base
// ============================================

import supabase from '../db';
import logger from '../utils/logger';

interface RAGResult {
    context: string;
    sources: string[];
    relevanceScore: number;
}

/**
 * Query the tenant's knowledge base for relevant context
 */
export async function queryKnowledgeBase(
    tenantId: string,
    userMessage: string
): Promise<RAGResult> {
    try {
        // Get all active knowledge entries for the tenant
        const { data: entries, error } = await supabase
            .from('KnowledgeEntry')
            .select('*')
            .eq('tenantId', tenantId)
            .eq('isActive', true);

        if (error) throw error;
        if (!entries || entries.length === 0) {
            return { context: '', sources: [], relevanceScore: 0 };
        }

        // Simple keyword matching (can be upgraded to vector search later)
        const keywords = userMessage
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);

        const scored = entries.map(entry => {
            const searchText = `${entry.title} ${entry.content}`.toLowerCase();
            const matches = keywords.filter(k => searchText.includes(k));
            return {
                ...entry,
                score: matches.length / Math.max(keywords.length, 1),
            };
        });

        // Sort by relevance and take top 3
        const relevant = scored
            .filter(e => e.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        if (relevant.length === 0) {
            return { context: '', sources: [], relevanceScore: 0 };
        }

        // Format context for AI prompt
        const context = relevant
            .map(e => `[${e.category.toUpperCase()}] ${e.title}:\n${e.content}`)
            .join('\n\n');

        const avgScore = relevant.reduce((sum, e) => sum + e.score, 0) / relevant.length;

        logger.debug(
            { tenantId, matchCount: relevant.length, avgScore: avgScore.toFixed(2) },
            '📚 RAG context retrieved'
        );

        return {
            context,
            sources: relevant.map(e => e.title),
            relevanceScore: avgScore,
        };
    } catch (err) {
        logger.error({ error: err, tenantId }, 'RAG query failed');
        return { context: '', sources: [], relevanceScore: 0 };
    }
}
