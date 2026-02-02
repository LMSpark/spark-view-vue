import type { UnwrapRef } from 'vue';
export interface AsyncState<T = unknown> {
    data?: UnwrapRef<Awaited<T>>;
    loading: boolean;
    error?: Error;
}
export * from './spark-component.js';
export * from './common.js';
export * from './interfaces.js';
//# sourceMappingURL=index.d.ts.map