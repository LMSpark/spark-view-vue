import { type VNode, type Component } from 'vue';
import { Logger } from '../utils/logger.js';
import type { ComponentConfig, ComponentContext, CapabilityProvider } from '../types/spark-component.js';
import type { Implementation } from '../types/common.js';
export type SparkComponent<_TConfig = ComponentConfig> = ReturnType<typeof defineSparkComponent>;
export interface SparkComponentHelpers {
    context: ComponentContext;
    isVisible: boolean;
    isDisabled: boolean;
    provide: (name: string, implementation?: Implementation) => void;
    consume: (name: string) => Implementation | null;
    use: (name: string) => Implementation | null;
    whenAvailable: (name: string) => Promise<CapabilityProvider>;
    getProvider: (name: string) => CapabilityProvider | undefined;
    getInheritedProvider: <T = unknown>(name: string) => T | undefined;
    getComponent: (type: string) => Component | null;
    isComponentRegistered: (type: string) => boolean;
    logger: ReturnType<typeof Logger>;
}
/**
 * Unified API for creating Spark-compatible Vue components.
 * Supports both render functions and JSX.
 *
 * @example
 * ```typescript
 * // Using JSX with auto-registration (recommended)
 * const Button = defineSparkComponent({
 *   type: 'my-button',
 *   autoRegister: true, // Automatically register to global registry
 *   render: ({ config }, { isDisabled }) => (
 *     <button disabled={isDisabled}>
 *       {config.props?.label || 'Click me'}
 *     </button>
 *   )
 * })
 *
 * // Manual registration (for explicit control)
 * const ManualButton = defineSparkComponent({
 *   type: 'manual-button',
 *   render: ({ config }) => <button>{config.props?.label}</button>
 * })
 * // Later: Spark.register(ManualButton)
 *
 * // Using setup function with JSX
 * const SmartButton = defineSparkComponent({
 *   type: 'smart-button',
 *   autoRegister: true,
 *   setup: ({ config }, { consume, provide }) => {
 *     const theme = consume('theme') || { primaryColor: 'blue' }
 *     provide('click-handler', { onClick: () => console.log('clicked') })
 *
 *     return () => (
 *       <button style={{ backgroundColor: theme.primaryColor }}>
 *         {config.props?.label}
 *       </button>
 *     )
 *   }
 * })
 *
 * // Using template strings with interpolation
 * const TemplateButton = defineSparkComponent({
 *   type: 'template-button',
 *   template: ({ config }) => `<button class="${config.props?.variant || 'primary'}">${config.props?.label || 'Click'}</button>`
 * })
 *
 * // Using template with data interpolation
 * const DataButton = defineSparkComponent({
 *   type: 'data-button',
 *   template: ({ config }, { isDisabled }) =>
 *     `<button disabled="${isDisabled}" style="background: ${config.props?.color || 'blue'}">
 *        ${config.props?.label || 'Button'}
 *      </button>`
 * })
 *
 * // Using template literal function (advanced)
 * const AdvancedTemplate = defineSparkComponent({
 *   type: 'advanced-template',
 *   templateLiteral: (strings, config, helpers) => (props, h) =>
 *     `<div class="card">
 *        <h3>${config.props?.title}</h3>
 *        <p>${config.props?.description}</p>
 *      </div>`
 * })
 * ```
 */
export declare function defineSparkComponent<_TConfig extends ComponentConfig = ComponentConfig>(definition: {
    type: string;
    name?: string;
    version?: string;
    providers?: CapabilityProvider[];
    validator?: (config: _TConfig) => boolean;
    autoRegister?: boolean;
    setup?: (props: {
        config: _TConfig;
    }, helpers: SparkComponentHelpers) => VNode | unknown | (() => VNode | unknown);
    render?: (props: {
        config: _TConfig;
    }, helpers: SparkComponentHelpers) => VNode | unknown;
    template?: (props: {
        config: _TConfig;
    }, helpers: SparkComponentHelpers) => string;
    templateLiteral?: (strings: TemplateStringsArray, ...values: unknown[]) => (props: {
        config: _TConfig;
    }, helpers: SparkComponentHelpers) => string;
}): Component;
/**
 * @deprecated Use defineSparkComponent instead
 * Legacy factory for backward compatibility
 */
export declare function createSparkComponent<TConfig extends ComponentConfig = ComponentConfig>(options: {
    meta: {
        type: string;
        name?: string;
        version?: string;
        providers?: CapabilityProvider[];
        validator?: (config: TConfig) => boolean;
    };
    setup?: (props: {
        config: TConfig;
    }, ctx: unknown, helpers: unknown) => unknown;
}): SparkComponent<TConfig>;
//# sourceMappingURL=createSparkComponent.d.ts.map