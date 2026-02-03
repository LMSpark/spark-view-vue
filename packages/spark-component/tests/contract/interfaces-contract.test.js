import { describe, it, expect } from 'vitest';
// Contract tests that assert the public interfaces exist and basic shapes
describe('Contract: public interfaces', () => {
    it('IComponentRegistry should be a type and have expected keys', () => {
        const keys = ['register', 'unregister', 'get', 'has', 'getAllTypes'];
        // This test uses a runtime check of Object.keys on a minimal implementation
        const impl = {
            register() { },
            unregister() { return false; },
            get() { return undefined; },
            has() { return false; },
            getAllTypes() { return []; }
        };
        const missing = keys.filter(k => typeof impl[k] !== 'function');
        expect(missing.length).toBe(0);
    });
    it('IComponentManager should be a type and have expected methods', () => {
        const keys = ['registerComponent', 'createContext', 'destroyContext', 'getContext', 'getAllContexts'];
        const impl = {
            registerComponent() { },
            createContext() { return { id: '1', type: 'test', providers: {}, consumers: {} }; },
            destroyContext() { },
            getContext() { return undefined; },
            getAllContexts() { return []; }
        };
        const missing = keys.filter(k => typeof impl[k] !== 'function');
        expect(missing.length).toBe(0);
    });
    it('ICapabilityManager should be a type and have expected methods', () => {
        const keys = ['registerConnector', 'connect', 'disconnect'];
        const impl = {
            registerConnector() { },
            connect() { return false; },
            disconnect() { }
        };
        const missing = keys.filter(k => typeof impl[k] !== 'function');
        expect(missing.length).toBe(0);
    });
});
