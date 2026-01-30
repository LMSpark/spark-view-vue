import { valid as semverValid, satisfies as semverSatisfies, gte as semverGte } from 'semver';
import { Logger } from './logger.js';
export class SparkComponentRegistryImpl {
    constructor() {
        this.components = new Map();
        this.logger = Logger();
    }
    register(type, definition) {
        if (this.components.has(type)) {
            this.logger.warn(`Component type '${type}' is already registered. Overwriting...`);
        }
        if (!this.validateDefinition(definition)) {
            throw new Error(`Invalid component definition for type '${type}'`);
        }
        this.components.set(type, definition);
        this.logger.info(`✅ Registered SPARK component: ${type} (${definition.version})`);
    }
    get(type) {
        return this.components.get(type);
    }
    has(type) {
        return this.components.has(type);
    }
    getAllTypes() {
        return Array.from(this.components.keys());
    }
    getAllDefinitions() {
        return Array.from(this.components.values());
    }
    unregister(type) {
        const removed = this.components.delete(type);
        if (removed)
            this.logger.info(`🗑️ Unregistered SPARK component: ${type}`);
        return removed;
    }
    clear() {
        this.components.clear();
        this.logger.info('🧹 Cleared all SPARK component registrations');
    }
    validateDefinition(def) {
        if (!def.type)
            return false;
        if (!def.name)
            return false;
        if (!def.version)
            return false;
        if (!def.component)
            return false;
        return true;
    }
    isValidVersion(v) {
        return !!semverValid(v);
    }
    findCompatibleProviders(capabilityName, minVersion) {
        const matches = [];
        this.components.forEach((def, type) => {
            if (def.providers && Array.isArray(def.providers)) {
                for (const p of def.providers) {
                    if (p.name === capabilityName) {
                        if (!minVersion) {
                            matches.push(type);
                            break;
                        }
                        const v = p.version || '0.0.0';
                        try {
                            // If both are strict versions (e.g., '1.2.3'), use gte for minimal version semantics.
                            if (semverValid(v) && semverValid(minVersion)) {
                                if (semverGte(v, minVersion)) {
                                    matches.push(type);
                                    break;
                                }
                            }
                            else if (semverValid(v) && semverSatisfies(v, minVersion)) {
                                // minVersion may be a range like '^1.2.0' or '>=1.2.0 <2.0.0'
                                matches.push(type);
                                break;
                            }
                            else if (v === minVersion) {
                                // fallback for non-semver tokens
                                matches.push(type);
                                break;
                            }
                        }
                        catch (e) {
                            // on unexpected parse issues, fallback to exact match
                            this.logger.warn('semver parse failed for provider version', v, 'minVersion', minVersion, e);
                            if (v === minVersion) {
                                matches.push(type);
                                break;
                            }
                        }
                    }
                }
            }
        });
        return matches;
    }
}
export const componentRegistry = new SparkComponentRegistryImpl();
/**
 * Create a new, isolated component registry instance.
 * Prefer creating a dedicated registry when you want isolated test fixtures or alternative lifecycles.
 */
export function createComponentRegistry() {
    return new SparkComponentRegistryImpl();
}
// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.registerSparkComponent(...)` or `componentRegistry.register(...)` instead.
