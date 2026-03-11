type TemplateContext = Record<string, string | number | null | undefined>;

export function renderTemplate(content: string, context: TemplateContext): string {
    return content.replace(/\{([^}]+)\}/g, (_match, key) => {
        const value = context[key.trim()];
        return value === null || value === undefined ? '' : String(value);
    }).trim();
}
