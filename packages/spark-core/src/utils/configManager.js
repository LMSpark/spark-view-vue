import { Logger } from './logger.js';
let config = {};
const watchers = new Map();
export function setConfig(newConfig) { config = { ...config, ...newConfig }; Logger().info('Config set', newConfig); Object.entries(newConfig).forEach(([k, v]) => { watchers.get(k)?.forEach(cb => cb(v)); }); }
export function getConfig(key, defaultValue) {
    if (!key)
        return config;
    return (config[key] ?? defaultValue);
}
export function clearConfig() { config = {}; Logger().info('Config cleared'); watchers.clear(); }
export class ConfigManager {
    get(key, defaultValue) { return getConfig(key, defaultValue); }
    set(key, value) { const old = config[key]; config[key] = value; Logger().info(`Config updated: ${key}`); if (old !== value) {
        watchers.get(key)?.forEach(cb => cb(value));
    } }
    delete(key) { const had = config[key] !== undefined; delete config[key]; if (had) {
        watchers.get(key)?.forEach(cb => cb(undefined));
    } }
    watch(key, cb) { if (!watchers.has(key))
        watchers.set(key, new Set()); watchers.get(key)?.add(cb); return () => { watchers.get(key)?.delete(cb); }; }
    setMultiple(obj) { setConfig(obj); }
    getAll() { return { ...config }; }
    reset() { clearConfig(); }
}
