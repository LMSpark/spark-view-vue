// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useLocalStorage } from '../src/composables/index.js';
describe('useLocalStorage', () => {
    it('reads and writes to localStorage', () => {
        const key = 'test:key';
        localStorage.removeItem(key);
        const { value, setValue, remove } = useLocalStorage(key, 'default');
        expect(value.value).toBe('default');
        setValue('new');
        expect(JSON.parse(localStorage.getItem(key))).toBe('new');
        expect(value.value).toBe('new');
        remove();
        expect(value.value).toBe('default');
        expect(localStorage.getItem(key)).toBeNull();
    });
});
