/**
 * createSparkComponent - 动态组件创建工厂
 * 
 * 注意：使用类型断言桥接 ComponentContext 和基础能力系统
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { defineComponent, h, reactive, computed, onMounted, onUnmounted, inject, type VNode, type Component, type PropType } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager as defaultCapabilityManager } from '../capability/ComponentCapabilityManager.js'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'
import type { Implementation } from '../types/common.js'

const logger = Logger('Spark:Component')

// Simple template engine for safe HTML rendering
function createTemplateRenderer(template: string) {
  // Basic interpolation: {{variable}} or ${variable}
  const interpolated = template
    .replace(/\{\{(\w+)\}\}/g, '${$1}') // Convert {{var}} to ${var}
    .replace(/\$\{(\w+)\}/g, (_, varName) => `\${${varName}}`) // Keep ${var} as is

  return (data: Record<string, unknown>) => {
    try {
      // Use Function constructor for safe evaluation (no eval)
      const func = new Function(...Object.keys(data), `return \`${interpolated}\``)
      return func(...Object.values(data))
    } catch (error) {
      logger.warn('Template interpolation failed:', String(error))
      return template // Fallback to original template
    }
  }
}

// Safe HTML renderer that escapes content
function renderSafeHTML(html: string): VNode {
  // For now, we'll use a simple approach. In production, consider using a proper HTML sanitizer
  return h('div', {
    innerHTML: html,
    class: 'spark-template-content'
  })
}

export type SparkComponent<_TConfig = ComponentContext> = ReturnType<typeof defineSparkComponent>

// Local helper to create a noop provider when a capability is missing
function createNoopProvider(name: string): CapabilityProvider {
  return { name, version: '0.0.0', implementation: {} }
}

export interface SparkComponentHelpers {
  // Context and state
  context: ComponentContext
  isVisible: boolean
  isDisabled: boolean

  // Capability system
  provide: (name: string, implementation?: Implementation) => void
  consume: (name: string) => Implementation | null
  use: (name: string) => Implementation | null // Alias for consume - more intuitive naming
  whenAvailable: (name: string) => Promise<CapabilityProvider>
  getProvider: (name: string) => CapabilityProvider | undefined
  getInheritedProvider: <T = unknown>(name: string) => T | undefined

  // Component system
  getComponent: (type: string) => Component | null
  isComponentRegistered: (type: string) => boolean

  // Utilities
  logger: ReturnType<typeof Logger>
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
export function defineSparkComponent<_TConfig extends ComponentContext = ComponentContext>(definition: {
  // Component metadata
  type: string
  name?: string

  // Auto-registration option (default: false for explicit control)
  autoRegister?: boolean

  // Component logic - choose one:
  // Option 1: Setup function (recommended for complex logic)
  setup?: (props: { config: _TConfig }, helpers: SparkComponentHelpers) => VNode | unknown | (() => VNode | unknown)

  // Option 2: Simple render function (for direct JSX/VNode return)
  render?: (props: { config: _TConfig }, helpers: SparkComponentHelpers) => VNode | unknown

  // Option 3: Template function (for string-based templates with interpolation)
  template?: (props: { config: _TConfig }, helpers: SparkComponentHelpers) => string

  // Option 4: Template literal function (for tagged template literals)
  templateLiteral?: (strings: TemplateStringsArray, ...values: unknown[]) => (props: { config: _TConfig }, helpers: SparkComponentHelpers) => string
}) {
  if (!definition?.type) {
    throw new Error('defineSparkComponent requires a type property')
  }

  const component = defineComponent({
    name: definition.name ?? definition.type,
    props: {
      config: {
        type: Object as PropType<_TConfig>,
        required: true,
        validator: (value: unknown) => {
          if (!value || typeof value !== 'object') return false
          const obj = value as Record<string, unknown>
          // 基本类型检查：必须有 type 字段
          if (!obj.type || typeof obj.type !== 'string') return false
          return true
        }
      }
    },
    setup(props: { config: _TConfig }) {
      // Create component context
      const ctxRaw: ComponentContext = {
        id: props.config.id ?? `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
        type: props.config.type,
        parent: undefined, // Will be set by parent component
        children: [],
        state: { ...props.config },  // \u5c06\u539f\u59cb config \u5b58\u5165 state
        providers: new Set<CapabilityProvider>(),
        consumers: new Map<string, CapabilityConsumer>()
      }

      const context = reactive(ctxRaw)
      const logger = Logger(`Spark:${props.config.type ?? 'Component'}`)

      // Resolve manager via DI
      const resolvedManager = (inject(SPARK_MANAGER_KEY)) ?? (inject('sparkManager'))
      if (!resolvedManager) {
        throw new Error('Component manager not found. Install Spark Vue plugin: app.use(Spark.createVuePlugin())')
      }
      const manager = resolvedManager
      
      // Get capabilityManager from manager if available, fallback to global singleton
      const capabilityManager = (typeof (manager as { getCapabilityManager?: () => unknown }).getCapabilityManager === 'function')
        ? (manager as { getCapabilityManager: () => unknown }).getCapabilityManager() as typeof defaultCapabilityManager
        : defaultCapabilityManager

      // Computed properties
      const isVisible = computed(() => (props.config as Record<string, unknown>).visible !== false)
      const isDisabled = computed(() => (props.config as Record<string, unknown>).disabled === true)

      // Capability system functions
      function provide(name: string, implementation?: Implementation) {
        const p: CapabilityProvider = { name, version: '1.0.0', implementation }
        if (manager && typeof (manager).registerProvider === 'function') {
          (manager).registerProvider(context, p)
        } else {
          context.providers.add(p)
        }
        logger.info(`🔌 Provided capability: ${name} for ${context.type} (${context.id})`)
      }

      function consume(name: string): Implementation | null {
        const consumer: CapabilityConsumer = { capabilityName: name, implementation: undefined }
        context.consumers.set(name, consumer)
        const provider = Array.from(context.providers).find(p => p.name === name) ?? createNoopProvider(name)
        if (provider) {
          consumer.implementation = ((provider).implementation ?? (provider as unknown as Implementation)) as Implementation | undefined
          try { capabilityManager.connectCapability(provider as any, consumer as any, context as any) } catch (e: unknown) { logger.warn('autoConnectCapabilities failed', String(e)) }
          logger.info(`🔌 Consumed capability: ${name} for ${context.type} (${context.id})`)
          return (consumer.implementation ?? null) as Implementation | null
        }
        logger.warn(`⚠️ Capability not found (registered consumer for late-binding): ${name} for ${context.type} (${context.id})`)
        return null
      }

      function whenAvailable(name: string): Promise<CapabilityProvider> {
        const p = Array.from(context.providers).find(pr => pr.name === name)
        if (p) return Promise.resolve(p)
        return new Promise(resolve => {
          context.providerListeners = context.providerListeners ?? new Map()
          if (!context.providerListeners.has(name)) context.providerListeners.set(name, new Set())
          const set = context.providerListeners.get(name) ?? new Set()
          const cb = (prov: CapabilityProvider) => { set.delete(cb); resolve(prov) }
          set.add(cb)
        })
      }

      function getProvider(name: string): CapabilityProvider | undefined {
        return Array.from(context.providers).find(p => p.name === name)
      }

      function getInheritedProvider<T = unknown>(name: string): T | undefined {
        let current: ComponentContext | undefined = context
        while (current) {
          const p = Array.from(current.providers).find(pr => pr.name === name)
          if (p?.implementation !== undefined) return p.implementation as unknown as T
          current = current.parent ?? undefined
        }
        return undefined
      }

      function getComponent(type: string): Component | null {
        try {
          const def = (manager).getComponentDefinition(type)
          return def?.component as Component ?? null
        } catch {
          const fallbackRegistry = (inject(SPARK_REGISTRY_KEY))
          return fallbackRegistry?.get(type)?.component as Component ?? null
        }
      }

      function isComponentRegistered(type: string) {
        try { return (manager).isComponentRegistered(type) } catch {
          const fallbackRegistry = (inject(SPARK_REGISTRY_KEY))
          return fallbackRegistry ? fallbackRegistry.has(type) : false
        }
      }

      // Create helpers object
      const helpers: SparkComponentHelpers = {
        context,
        isVisible: isVisible.value,
        isDisabled: isDisabled.value,
        provide,
        consume,
        use: consume, // Alias for consume - more intuitive naming
        whenAvailable,
        getProvider,
        getInheritedProvider,
        getComponent,
        isComponentRegistered,
        logger
      }

      // Lifecycle
      const initialize = () => logger.info(`🚀 Initializing SPARK component: ${context.type} (${context.id})`)
      const destroy = () => {
        logger.info(`🗑️ Destroying SPARK component: ${context.type} (${context.id})`)
        context.providers.clear()
        context.consumers.clear()
        try { manager.destroyContext(context.id) } catch (e: unknown) { logger.warn('Failed to destroy context via manager', String(e)) }
      }

      onMounted(() => {
        initialize()
        manager.registerContext(context)
        logger.info(`📝 Registered context to manager: ${context.id}`)
      })

      onUnmounted(() => {
        if (!manager) { logger.error('Component manager not found during unmount.'); return }
        try { manager.destroyContext(context.id); logger.info(`🗑️ Destroyed context via manager: ${context.id}`) } catch (e) { logger.error('Failed to destroy context via manager', String(e)); destroy() }
      })

      // Register default capability exposing the runtime context to consumers
      provide('sparkContext', context)

      // Execute user setup or render - support JSX and various return types
      if (definition.setup) {
        const setupResult = definition.setup(props, helpers)

        // If setup returns a function, call it (for lazy evaluation)
        if (typeof setupResult === 'function') {
          return setupResult
        }

        // If setup returns JSX/VNode directly, return it
        return () => setupResult
      }

      if (definition.render) {
        // Render function returns JSX/VNode directly
        return () => definition.render?.(props, helpers)
      }

      if (definition.template) {
        // Template function returns HTML string with interpolation support
        const templateStr = definition.template(props, helpers)
        const renderer = createTemplateRenderer(templateStr)

        // Create data object for interpolation
        const templateData = {
          config: props.config,
          helpers,
          ...props.config.props, // Allow direct access to props
          ...helpers // Allow access to helper functions
        }

        return () => {
          const rendered = renderer(templateData)
          return renderSafeHTML(rendered)
        }
      }

      if (definition.templateLiteral) {
        // Template literal function for advanced templating
        return () => {
          const templateFunc = definition.templateLiteral?.([] as unknown as TemplateStringsArray, props.config, helpers)
          const html = templateFunc?.({ config: props.config }, helpers) ?? ''
          return renderSafeHTML(html)
        }
      }

      // Default render
      return () => h('div', {
        class: 'spark-component-default',
        'data-spark-type': definition.type
      }, [`${definition.type}`])
    }
  })

  // Attach meta for automatic registration
  ;(component as Component & { spark?: Record<string, unknown> }).spark = {
    type: definition.type,
    name: definition.name
  }

  // Auto-register if requested
  if (definition.autoRegister) {
    try {
      // Try to get manager from global Spark namespace
      // Use dynamic import to avoid circular dependencies and bundling issues
      const sparkNamespace = (globalThis as Record<string, unknown>).Spark as { register?: (component: Component) => void } | undefined
      if (sparkNamespace && typeof sparkNamespace.register === 'function') {
        sparkNamespace.register(component)
        logger.info(`🔧 Auto-registered SPARK component: ${definition.type}`)
      } else {
        logger.warn(`⚠️ Failed to auto-register component ${definition.type}: Spark namespace not available globally`)
        logger.warn('💡 Make sure to call Spark.register() manually or ensure Spark namespace is available')
      }
    } catch (error) {
      logger.warn(`⚠️ Failed to auto-register component ${definition.type}:`, String(error))
      logger.warn('💡 Make sure to call Spark.register() manually or ensure Spark namespace is available')
    }
  }

  return component as Component
}

