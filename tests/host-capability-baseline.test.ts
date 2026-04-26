/**
 * Provider / Capability 链路基线测试
 *
 * 核心行为：
 * 1. 默认键集合为空，不再承载 host 专用能力查询
 * 2. 显式能力键查询与本地/链式消费仍可正常工作
 * 3. RendererHostScope 有 row prop 时注入 DATA_ROW，无 row 时不覆盖父层
 * 4. 动作能力通过 ACTION_CAPABILITY 独立提供
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import {
  Spark,
  ACTION_CAPABILITY,
  SPARK_REGISTRY_KEY,
  useSparkComponent,
  useSparkConsume,
  DATA_ROW,
} from '@spark-view/spark-component'
import type { SparkActionCapability, SparkNode } from '@spark-view/spark-component'
import {
  createActionCapability,
  findNearestCapabilityProvider,
  findNearestCapabilityProviderByKeys,
  consumeCapabilityFromProvider,
} from '../packages/spark-component/src/core/capabilities'
import { consumeSparkCapability, createSparkCapabilityContext } from '../packages/spark-component/src/core/capability-system'

// ═══════════════════════════════════════════════════════
// 1. 默认键集合 provider 查询 — 纯上下文层测试
// ═══════════════════════════════════════════════════════

describe('findNearestCapabilityProviderByKeys([]) — 上下文链逐层查找', () => {
  it('默认键集合为空时返回 null', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, root)

    expect(findNearestCapabilityProviderByKeys(leaf, [])).toBeNull()
    expect(findNearestCapabilityProviderByKeys(root, [])).toBeNull()
  })
})

describe('provider 查询三段式语义', () => {
  it('默认键集合为空时不会误判普通能力 provider', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const actionOnly = createSparkCapabilityContext({ id: 'action-only', type: 'r-container' }, root)
    actionOnly.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))

    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-button' }, actionOnly)

    expect(findNearestCapabilityProvider(leaf, ACTION_CAPABILITY)?.id).toBe('action-only')
    expect(findNearestCapabilityProviderByKeys(leaf, [])).toBeNull()
  })

  it('通过能力键集合查最近 provider', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const section = createSparkCapabilityContext({ id: 'section', type: 'r-section' }, root)
    section.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-text' }, section)

    expect(findNearestCapabilityProviderByKeys(leaf, [ACTION_CAPABILITY])?.id).toBe('section')
  })

  it('通过能力键查询最近 provider context', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const provider = createSparkCapabilityContext({ id: 'provider', type: 'r-form' }, root)
    provider.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-input' }, provider)

    expect(findNearestCapabilityProvider(leaf, ACTION_CAPABILITY)?.id).toBe('provider')
  })

  it('基于 provider context 查能力（本地/链式）', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))

    const section = createSparkCapabilityContext({ id: 'section', type: 'r-section' }, root)
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-input' }, section)

    const provider = findNearestCapabilityProviderByKeys(leaf, [ACTION_CAPABILITY])
    expect(provider?.id).toBe('root')
    expect(consumeCapabilityFromProvider(provider, ACTION_CAPABILITY, { localOnly: true })).not.toBeNull()
    expect(consumeCapabilityFromProvider(provider, ACTION_CAPABILITY)).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════
// 2. Vue 组件内能力链路 — provider 查询
// ═══════════════════════════════════════════════════════

describe('Vue 组件内 provider 能力链路', () => {
  function createSystem() {
    return Spark.createSystem()
  }

  it('子组件通过 ACTION_CAPABILITY 读到容器声明的能力', () => {
    let canExecuteAction = false

    const Child = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-button' } as SparkNode)
        canExecuteAction = sparkConsume(ACTION_CAPABILITY) !== null
        return () => h('span', 'child')
      },
    })

    const Container = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-form' } as SparkNode)
        sparkProvide(ACTION_CAPABILITY, createActionCapability({
          isDisabled: () => false,
          execute: () => undefined,
        }))
        return () => h(Child)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { parentContext: rootContext })
        return () => h(Container)
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    expect(canExecuteAction).toBe(true)
  })

  it('中间层无 provider 能力时跳过，子组件读到更远的 provider', () => {
    let hasActionCapability = false

    const Leaf = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-text' } as SparkNode)
        hasActionCapability = sparkConsume(ACTION_CAPABILITY) !== null
        return () => h('span', 'leaf')
      },
    })

    const MiddleNoProvider = defineComponent({
      setup() {
        useSparkComponent({ type: 'r-section' } as SparkNode)
        // 中间层不声明相关能力，链路继续向上解析
        return () => h(Leaf)
      },
    })

    const Container = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-container' } as SparkNode)
        sparkProvide(ACTION_CAPABILITY, createActionCapability({
          isDisabled: () => false,
          execute: () => undefined,
        }))
        return () => h(MiddleNoProvider)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { parentContext: rootContext })
        return () => h(Container)
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    expect(hasActionCapability).toBe(true)
  })

  it('useSparkConsume 也能读取最近 ACTION_CAPABILITY', () => {
    let consumedActionCapability: SparkActionCapability | null = null

    const Consumer = defineComponent({
      setup() {
        const { sparkConsume } = useSparkConsume()
        consumedActionCapability = sparkConsume(ACTION_CAPABILITY)
        return () => h('span', 'consumer')
      },
    })

    const Container = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-detail' } as SparkNode)
        sparkProvide(ACTION_CAPABILITY, createActionCapability({
          isDisabled: () => false,
          execute: () => undefined,
        }))
        return () => h(Consumer)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { parentContext: rootContext })
        return () => h(Container)
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    expect(consumedActionCapability).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════
// 3. RendererHostScope — DATA_ROW 注入行为
// ═══════════════════════════════════════════════════════

describe('RendererHostScope DATA_ROW 注入', () => {
  function createSystem() {
    return Spark.createSystem()
  }

  it('传入 row prop 时子组件可消费 DATA_ROW', async () => {
    let consumedRow: Record<string, unknown> | null = null

    const RowConsumer = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-text' } as SparkNode)
        consumedRow = sparkConsume(DATA_ROW) as Record<string, unknown> | null
        return () => h('span', 'consumer')
      },
    })

    // 在组件中手动构建 RendererHostScope 等价行为
    const ProviderScopeSimulator = defineComponent({
      props: {
        row: { type: Object, default: undefined },
      },
      setup(props) {
        const { sparkProvide } = useSparkComponent({ type: 'r-host-data-scope' } as SparkNode)
        if (props.row !== undefined) {
          sparkProvide(DATA_ROW, props.row)
        }
        return () => h(RowConsumer)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { parentContext: rootContext })
        return () => h(ProviderScopeSimulator, {
          row: { name: 'Alice', age: 30 },
        })
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    expect(consumedRow).not.toBeNull()
    expect(consumedRow!['name']).toBe('Alice')
  })

  it('未传 row prop 时不覆盖父层 DATA_ROW', () => {
    let consumedRow: Record<string, unknown> | null = null

    const RowConsumer = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-text' } as SparkNode)
        consumedRow = sparkConsume(DATA_ROW) as Record<string, unknown> | null
        return () => h('span', 'consumer')
      },
    })

    const InnerScope = defineComponent({
      setup() {
        // 模拟无 row 的纯 provider 作用域——不提供 DATA_ROW
        useSparkComponent({ type: 'r-host-data-scope' } as SparkNode)
        return () => h(RowConsumer)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'page' } as SparkNode, { parentContext: rootContext })
        // 父层提供 DATA_ROW
        sparkProvide(DATA_ROW, { name: 'ParentRow' })
        return () => h(InnerScope)
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    // 子组件应读到父层的 DATA_ROW，而非 null
    expect(consumedRow).not.toBeNull()
    expect(consumedRow!['name']).toBe('ParentRow')
  })
})

// ═══════════════════════════════════════════════════════
// 5. 动作能力独立提供
// ═══════════════════════════════════════════════════════

describe('动作能力行为', () => {
  it('动作能力通过 ACTION_CAPABILITY 独立提供', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    let executed = false
    const container = createSparkCapabilityContext({ id: 'container', type: 'r-table' }, root)
    container.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => { executed = true },
    }))

    const btn = createSparkCapabilityContext({ id: 'btn', type: 'r-button' }, container)
    const actionProvider = consumeSparkCapability<SparkActionCapability>(btn, ACTION_CAPABILITY)

    expect(actionProvider!.isDisabled({} as SparkNode)).toBe(false)
    actionProvider!.execute({} as SparkNode)
    expect(executed).toBe(true)
  })
})
