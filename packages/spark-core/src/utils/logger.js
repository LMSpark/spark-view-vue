/* eslint-disable no-console */
function formatMsg(level, args) {
    return [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...args];
}
/**
 * Create a logger instance. Prefer this API over any legacy helpers.
 * Signature: Logger(context?: unknown): LoggerApi
 */
export function Logger(context) {
    // Prefer context-level provider, then fallback to console
    const providersSet = (typeof context === 'object' && context && context.providers) ? context.providers : undefined;
    const ctxProvider = providersSet ? Array.from(providersSet).find((p) => typeof (p).name === 'string' && (p).name === 'logger') : undefined;
    const provider = ctxProvider;
    const impl = provider ? ((provider.implementation) ?? provider) : null;
    const call = (fnName, args) => {
        const fn = impl?.[fnName];
        if (typeof fn === 'function')
            return fn(...args);
        // fallback to console
        if (fnName === 'debug')
            return console.debug(...formatMsg('debug', args));
        if (fnName === 'info')
            return console.info(...formatMsg('info', args));
        if (fnName === 'warn')
            return console.warn(...formatMsg('warn', args));
        return console.error(...formatMsg('error', args));
    };
    return {
        debug: (...args) => call('debug', args),
        info: (...args) => call('info', args),
        warn: (...args) => call('warn', args),
        error: (...args) => call('error', args)
    };
}
export function createConsoleTransport(_level = 'info') {
    return {
        level: _level,
        log(_level, message, meta) {
            const out = `[${_level.toUpperCase()}] ${message}`;
            if (meta)
                console[_level === 'error' ? 'error' : 'log'](out, meta);
            else
                console[_level === 'error' ? 'error' : 'log'](out);
        }
    };
}
export function createHttpTransport(endpoint, _level = 'error') {
    return {
        async log(_level, message, meta) {
            try {
                // fire and forget
                await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: _level, message, meta }) });
            }
            catch { /* ignore */ }
        }
    };
}
export function createMemoryTransport(storage = []) {
    return {
        log(level, message, meta) { storage.push({ level, message, meta, ts: Date.now() }); }
    };
}
