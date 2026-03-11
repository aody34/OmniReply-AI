import { beforeEach, describe, expect, it, vi } from 'vitest';

const { schedulePendingReplyForIncomingMessage } = vi.hoisted(() => ({
    schedulePendingReplyForIncomingMessage: vi.fn(),
}));

vi.mock('../../src/lib/automation/pending-replies', () => ({
    schedulePendingReplyForIncomingMessage,
}));

import { handleIncomingMessage } from '../../src/lib/ai/handler';

describe('incoming message handler', () => {
    beforeEach(() => {
        schedulePendingReplyForIncomingMessage.mockReset();
        schedulePendingReplyForIncomingMessage.mockResolvedValue({
            messageLogId: 'log-1',
            pendingReply: { id: 'pending-1' },
            evaluation: { sourceType: 'DEFAULT_AI' },
        });
    });

    it('queues a pending reply instead of sending immediately', async () => {
        await handleIncomingMessage('tenant-1', '252612345678', 'Hello there');

        expect(schedulePendingReplyForIncomingMessage).toHaveBeenCalledTimes(1);
        expect(schedulePendingReplyForIncomingMessage).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            phone: '252612345678',
            message: 'Hello there',
        });
    });
});
