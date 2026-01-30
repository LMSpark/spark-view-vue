import { describe, it, expect } from 'vitest';
import { useAsyncState } from '../src/composables/index.js';
describe('useAsyncState', () => {
    it('executes async operation and sets data', async () => {
        const { state, execute } = useAsyncState(0);
        await execute(() => Promise.resolve(42));
        expect(state.value.data).toBe(42);
        expect(state.value.loading).toBe(false);
        expect(state.value.error).toBeUndefined();
    });
    it('captures error and sets error state', async () => {
        const { state, execute } = useAsyncState();
        await execute(() => Promise.reject(new Error('fail')));
        expect(state.value.data).toBeUndefined();
        expect(state.value.loading).toBe(false);
        expect(state.value.error).toBeInstanceOf(Error);
    });
});
