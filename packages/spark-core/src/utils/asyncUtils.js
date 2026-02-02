// async utilities (migrated from shared)
import { withRetry } from './errorHandler.js';
export class RaceController {
    constructor() {
        this.abortController = null;
    }
    static create() { return new RaceController(); }
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
    async execute(operation) {
        this.abort();
        this.abortController = new AbortController();
        const { signal } = this.abortController;
        try {
            return await operation(signal);
        }
        finally {
            this.abortController = null;
        }
    }
    get aborted() { return this.abortController?.signal.aborted ?? false; }
}
export const asyncUtils = {
    timeout(promise, options) {
        const { timeout, timeoutMessage = 'Operation timed out' } = options;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeout);
            promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
        });
    },
    async retry(operation, options) { return withRetry(operation, options); },
    createRaceController() { return RaceController.create(); },
    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
    async raceSafe(operation, controller) { return controller.execute(async (signal) => { if (signal.aborted)
        throw new Error('Operation was cancelled'); const result = await operation(); if (signal.aborted)
        throw new Error('Operation was cancelled'); return result; }); }
};
