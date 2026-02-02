import { withRetry } from './errorHandler.js';
export interface TimeoutOptions {
    timeout: number;
    timeoutMessage?: string;
}
export declare class RaceController {
    private abortController;
    static create(): RaceController;
    abort(): void;
    execute<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
    get aborted(): boolean;
}
export declare const asyncUtils: {
    timeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T>;
    retry<T_1>(operation: () => Promise<T_1>, options: Parameters<typeof withRetry>[1]): Promise<T_1>;
    createRaceController(): RaceController;
    delay(ms: number): Promise<unknown>;
    raceSafe<T_2>(operation: () => Promise<T_2>, controller: {
        execute: (op: (signal: AbortSignal) => Promise<T_2>) => Promise<T_2>;
    }): Promise<T_2>;
};
//# sourceMappingURL=asyncUtils.d.ts.map