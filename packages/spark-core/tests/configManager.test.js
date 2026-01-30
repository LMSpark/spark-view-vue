import { describe, it, expect } from 'vitest';
import { ConfigManager, setConfig, getConfig, clearConfig } from '../src/utils/configManager.js';
describe('ConfigManager', () => {
    it('set and get config', () => {
        setConfig({ foo: 'bar' });
        expect(getConfig('foo')).toBe('bar');
    });
    it('ConfigManager.getInstance works and watch triggers', () => {
        const mgr = ConfigManager.getInstance();
        let seen;
        const un = mgr.watch('k', (v) => { seen = v; });
        mgr.set('k', 123);
        expect(seen).toBe(123);
        un();
    });
    it('clearConfig and reset', () => {
        setConfig({ a: 1 });
        expect(getConfig('a')).toBe(1);
        clearConfig();
        expect(getConfig('a')).toBeUndefined();
    });
});
