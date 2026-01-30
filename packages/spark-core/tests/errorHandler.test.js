import { describe, it, expect } from 'vitest';
import { withRetry, handleError, getUserFriendlyMessage, AppError, ErrorType } from '../src/index.js';
describe('ErrorHandler', () => {
    it('withRetry succeeds after retries', async () => {
        let count = 0;
        const op = async () => {
            count++;
            if (count < 3)
                throw new Error('transient failure');
            return 'ok';
        };
        const result = await withRetry(op, { maxAttempts: 3, delay: 1, backoff: 'fixed' });
        expect(result).toBe('ok');
        expect(count).toBe(3);
    });
    it('withRetry throws AppError when all attempts fail', async () => {
        const op = async () => { throw new Error('persistent fail'); };
        await expect(withRetry(op, { maxAttempts: 2, delay: 1, backoff: 'fixed' })).rejects.toThrow(AppError);
    });
    it('getUserFriendlyMessage maps network error', () => {
        const e = new AppError('net', ErrorType.NETWORK);
        const msg = getUserFriendlyMessage(e);
        expect(msg).toContain('网络连接');
    });
    it('handleError throws AppError', () => {
        expect(() => handleError(new Error('boom'))).toThrow(AppError);
    });
});
