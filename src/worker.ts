import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

import logger from './lib/utils/logger';
import { isDbConfigured } from './lib/db';
import { startPendingReplyWorker } from './lib/automation/worker';

async function bootstrap(): Promise<void> {
    if (!isDbConfigured) {
        logger.error('Database is not configured; worker cannot start');
        process.exit(1);
    }

    if (process.env.ENABLE_WHATSAPP_RECONNECT_ON_BOOT === 'true') {
        const { reconnectAllSessions } = await import('./lib/whatsapp/connector');
        await reconnectAllSessions();
    }

    startPendingReplyWorker();
    logger.info({ nodeEnv: process.env.NODE_ENV || 'development' }, 'Pending reply worker process started');
}

bootstrap().catch((error) => {
    logger.error({ error }, 'Worker bootstrap failed');
    process.exit(1);
});
