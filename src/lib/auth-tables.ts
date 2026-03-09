import logger from './utils/logger';

export type AuthTables = {
    userTable: string;
    tenantTable: string;
};

const AUTH_TABLE_CANDIDATES: AuthTables[] = [
    { userTable: 'User', tenantTable: 'Tenant' },
    { userTable: 'users', tenantTable: 'tenants' },
];

let resolvedAuthTables: AuthTables | null = null;

function isMissingRelationError(error: any): boolean {
    const message = String(error?.message || '');
    return error?.code === '42P01' || /relation .* does not exist/i.test(message);
}

export async function resolveAuthTables(client: { from: (table: string) => any }): Promise<AuthTables> {
    if (resolvedAuthTables) return resolvedAuthTables;

    for (const candidate of AUTH_TABLE_CANDIDATES) {
        const { error } = await client.from(candidate.userTable).select('id').limit(1);

        if (!error) {
            resolvedAuthTables = candidate;
            logger.info(candidate, 'Resolved auth table mapping');
            return candidate;
        }

        if (!isMissingRelationError(error)) {
            resolvedAuthTables = candidate;
            logger.warn({ candidate, error }, 'Using auth table mapping despite probe error');
            return candidate;
        }
    }

    resolvedAuthTables = AUTH_TABLE_CANDIDATES[0];
    logger.warn(resolvedAuthTables, 'Falling back to default auth table mapping');
    return resolvedAuthTables;
}
