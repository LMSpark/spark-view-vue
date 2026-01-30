import { describe, it, expect } from 'vitest';
import { Spark } from '../src/spark-namespace.js';
describe('GlobalProviderRegistry removal', () => {
    it('should not expose global provider helpers on Spark namespace', () => {
        expect(Spark.registerGlobalProvider).toBeUndefined();
        expect(Spark.getGlobalProvider).toBeUndefined();
        expect(Spark.getOrCreateNoopProvider).toBeUndefined();
    });
});
