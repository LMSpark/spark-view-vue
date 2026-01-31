import { Logger } from './logger.js';
let config = {};
const watchers = new Map();
export function setConfig(newConfig) { config = Object.assign(Object.assign({}, config), newConfig); Logger().info('Config set', newConfig); Object.entries(newConfig).forEach(([k, v]) => { var _a; (_a = watchers.get(k)) === null || _a === void 0 ? void 0 : _a.forEach(cb => cb(v)); }); }
export function getConfig(key, defaultValue) {
    var _a;
    if (!key)
        return config;
    return ((_a = config[key]) !== null && _a !== void 0 ? _a : defaultValue);
}
export function clearConfig() { config = {}; Logger().info('Config cleared'); watchers.clear(); }
export class ConfigManager {
    get(key, defaultValue) { return getConfig(key, defaultValue); }
    set(key, value) { var _a; const old = config[key]; config[key] = value; Logger().info(`Config updated: ${key}`); if (old !== value) {
        (_a = watchers.get(key)) === null || _a === void 0 ? void 0 : _a.forEach(cb => cb(value));
    } }
    delete(key) { var _a; const had = config[key] !== undefined; delete config[key]; if (had) {
        (_a = watchers.get(key)) === null || _a === void 0 ? void 0 : _a.forEach(cb => cb(undefined));
    } }
    watch(key, cb) { if (!watchers.has(key))
        watchers.set(key, new Set()); watchers.get(key).add(cb); return () => { watchers.get(key).delete(cb); }; }
    setMultiple(obj) { setConfig(obj); }
    getAll() { return Object.assign({}, config); }
    reset() { clearConfig(); }
}
