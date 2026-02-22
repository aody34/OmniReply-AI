// ============================================
// OmniReply AI — Multi-Language Detection
// Supports Somali (so) and English (en)
// ============================================

// Simple keyword-based language detection optimized for Somali/English
// We use a lightweight approach instead of franc for better control

const SOMALI_INDICATORS = [
    'waa', 'maxaa', 'sidee', 'magaca', 'mahadsanid', 'fadlan', 'haa', 'maya',
    'lacag', 'qiimo', 'cunto', 'daawo', 'suuq', 'guri', 'shaqo', 'waxaan',
    'miyaad', 'naga', 'iga', 'kugu', 'noo', 'keen', 'bixin', 'iibso',
    'soo', 'warsho', 'taleefan', 'adeeg', 'macaamiil', 'qaali', 'raqiis',
    'subax', 'galab', 'habeen', 'maanta', 'berri', 'shalay', 'maalin',
    'dukaan', 'farmashiye', 'caafimaad', 'dhakhtar', 'dugsi', 'cashar',
    'cunno', 'shaah', 'bariis', 'hilib', 'caano', 'saliid'
];

const ENGLISH_INDICATORS = [
    'the', 'is', 'are', 'what', 'how', 'much', 'price', 'menu', 'order',
    'hello', 'hi', 'please', 'thank', 'yes', 'no', 'want', 'need',
    'available', 'open', 'close', 'delivery', 'payment', 'buy', 'cost',
    'when', 'where', 'which', 'can', 'would', 'could', 'help', 'thanks',
    'good', 'morning', 'evening', 'night', 'today', 'tomorrow', 'time'
];

export function detectLanguage(text: string): 'so' | 'en' {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    let somaliScore = 0;
    let englishScore = 0;

    for (const word of words) {
        if (SOMALI_INDICATORS.includes(word)) somaliScore++;
        if (ENGLISH_INDICATORS.includes(word)) englishScore++;
    }

    // Default to English if no clear signal
    return somaliScore > englishScore ? 'so' : 'en';
}

export function getLanguageInstruction(lang: 'so' | 'en'): string {
    if (lang === 'so') {
        return 'Ku jawaab Af-Soomaali. Respond in Somali language. Be natural, polite, and helpful.';
    }
    return 'Respond in English. Be natural, polite, and helpful.';
}

export function getLanguageName(code: string): string {
    const map: Record<string, string> = {
        'so': 'Somali',
        'en': 'English',
    };
    return map[code] || 'English';
}
