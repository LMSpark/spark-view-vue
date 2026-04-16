/**
 * Provider / Capability 链路基线测试
 *
 * 核心行为：
 * 1. 默认键集合沿 ctx.parent 链找 provider，跳过无相关能力的中间节点
 * 2. fieldMode / variant 通过能力键读取
 * 3. RendererHostScope 有 row prop 时注入 DATA_ROW，无 row 时不覆盖父层
 * 4. variant === 'row-action' 时通过 HOST_VARIANT 分支
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import {
  Spark,
  ACTION_CAPABILITY,
  DEFAULT_PROVIDER_KEYS,
  HOST_FIELD_MODE,
  HOST_VARIANT,
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

describe('findNearestCapabilityProviderByKeys(DEFAULT_PROVIDER_KEYS) — 上下文链逐层查找', () => {
  it('从 ctx.parent 开始查找，跳过自身', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(HOST_FIELD_MODE, 'form')

    const mid = createSparkCapabilityContext({ id: 'mid', type: 'section' }, root)
    // mid 不声明相关能力键

    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, mid)
    leaf.capabilities.set(HOST_VARIANT, 'leaf-variant')

    const found = findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)
    // 应找到 root，而不是 leaf 自身（mid 无相关键被跳过）
    expect(found).not.toBeNull()
    // root 没有更高层 provider
    expect(findNearestCapabilityProviderByKeys(found!, DEFAULT_PROVIDER_KEYS)).toBeNull()
    expect(consumeSparkCapability<string>(leaf, HOST_FIELD_MODE)).toBe('form')
  })

  it('中间节点有相关键时返回最近一层', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(HOST_FIELD_MODE, 'form')

    const mid = createSparkCapabilityContext({ id: 'mid', type: 'table' }, root)
    mid.capabilities.set(HOST_FIELD_MODE, 'table')

    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, mid)

    const found = findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)
    // 返回 mid（最近），mid 的父层 root 也可作为 provider
    expect(findNearestCapabilityProviderByKeys(found!, DEFAULT_PROVIDER_KEYS)).not.toBeNull()
    expect(consumeSparkCapability<string>(leaf, HOST_FIELD_MODE)).toBe('table')
  })

  it('无 provider 时返回 null', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, root)

    expect(findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)).toBeNull()
  })

  it('根节点无 parent 时返回 null', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    expect(findNearestCapabilityProviderByKeys(root, DEFAULT_PROVIDER_KEYS)).toBeNull()
  })

  it('DEFAULT_PROVIDER_KEYS 可作为默认 provider 查询集合工作', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(HOST_FIELD_MODE, 'form')
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, root)

    expect(findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)?.id).toBe('root')
  })
})

describe('provider 查询三段式语义', () => {
  it('默认键集合查询不把普通能力 provider 误判为目标 provider', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(HOST_FIELD_MODE, 'page')

    const actionOnly = createSparkCapabilityContext({ id: 'action-only', type: 'r-container' }, root)
    actionOnly.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))

    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-button' }, actionOnly)

    expect(findNearestCapabilityProvider(leaf, ACTION_CAPABILITY)?.id).toBe('action-only')
    expect(findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)?.id).toBe('root')
  })

  it('通过能力键集合查最近 provider', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const section = createSparkCapabilityContext({ id: 'section', type: 'r-section' }, root)
    section.capabilities.set(HOST_VARIANT, 'field')
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-text' }, section)

    expect(findNearestCapabilityProviderByKeys(leaf, [ACTION_CAPABILITY, HOST_VARIANT])?.id).toBe('section')
  })

  it('DEFAULT_PROVIDER_KEYS 可直接作为默认 provider 查询集合', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const form = createSparkCapabilityContext({ id: 'form', type: 'r-form' }, root)
    form.capabilities.set(HOST_FIELD_MODE, 'form')
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-input' }, form)

    expect(findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)?.id).toBe('form')
  })

  it('通过能力键查询最近 provider context', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const provider = createSparkCapabilityContext({ id: 'provider', type: 'r-form' }, root)
    provider.capabilities.set(HOST_FIELD_MODE, 'form')
    provider.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-input' }, provider)

    expect(findNearestCapabilityProvider(leaf, HOST_FIELD_MODE)?.id).toBe('provider')
    expect(findNearestCapabilityProvider(leaf, ACTION_CAPABILITY)?.id).toBe('provider')
  })

  it('通过单个能力键查 provider', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(HOST_FIELD_MODE, 'page')
    const table = createSparkCapabilityContext({ id: 'table', type: 'r-table' }, root)
    table.capabilities.set(HOST_VARIANT, 'row-action')
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-button' }, table)

    expect(findNearestCapabilityProvider(leaf, HOST_VARIANT)?.id).toBe('table')
    expect(findNearestCapabilityProvider(leaf, HOST_FIELD_MODE)?.id).toBe('root')
  })

  it('基于 provider context 查能力（本地/链式）', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.capabilities.set(HOST_FIELD_MODE, 'detail')
    root.capabilities.set(ACTION_CAPABILITY, createActionCapability({
      isDisabled: () => false,
      execute: () => undefined,
    }))

    const section = createSparkCapabilityContext({ id: 'section', type: 'r-section' }, root)
    section.capabilities.set(HOST_VARIANT, 'field')
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'r-input' }, section)

    const provider = findNearestCapabilityProviderByKeys(leaf, DEFAULT_PROVIDER_KEYS)
    expect(provider?.id).toBe('section')
    expect(consumeCapabilityFromProvider(provider, HOST_VARIANT, { localOnly: true })).toBe('field')
    expect(consumeCapabilityFromProvider(provider, ACTION_CAPABILITY, { localOnly: true })).toBeNull()
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

  it('子组件通过 HOST_FIELD_MODE 读到容器声明的字段语义', () => {
    let childFieldMode: string | undefined

    const Child = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-button' } as SparkNode)
        childFieldMode = sparkConsume(HOST_FIELD_MODE) ?? undefined
        return () => h('span', 'child')
      },
    })

    const Container = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-form' } as SparkNode)
        sparkProvide(HOST_FIELD_MODE, 'form')
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

    expect(childFieldMode).toBe('form')
  })

  it('中间层无 provider 能力时跳过，子组件读到更远的 provider', () => {
    let childFieldMode: string | undefined

    const Leaf = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-text' } as SparkNode)
        childFieldMode = sparkConsume(HOST_FIELD_MODE) ?? undefined
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
        const { sparkProvide } = useSparkComponent({ type: 'r-table' } as SparkNode)
        sparkProvide(HOST_FIELD_MODE, 'table')
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

    expect(childFieldMode).toBe('table')
  })

  it('useSparkConsume 也能通过 HOST_FIELD_MODE 读取最近 provider 语义', () => {
    let consumedFieldMode: string | undefined

    const Consumer = defineComponent({
      setup() {
        const { sparkConsume } = useSparkConsume()
        consumedFieldMode = sparkConsume(HOST_FIELD_MODE) ?? undefined
        return () => h('span', 'consumer')
      },
    })

    const Container = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-detail' } as SparkNode)
        sparkProvide(HOST_FIELD_MODE, 'detail')
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

    expect(consumedFieldMode).toBe('detail')
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
// 5. variant 字符串消费行为
// 4. variant 字符串消费行为
// ═══════════════════════════════════════════════════════

describe('variant 消费行为', () => {
  it('HOST_VARIANT 能力可正常传递和读取', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    const table = createSparkCapabilityContext({ id: 'table', type: 'r-table' }, root)
    table.capabilities.set(HOST_VARIANT, 'row-action')

    const button = createSparkCapabilityContext({ id: 'btn', type: 'r-button' }, table)

    expect(consumeSparkCapability(button, HOST_VARIANT)).toBe('row-action')
  })

  it('provider 有 HOST_VARIANT 时可用于样式分支判断', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    const toolbar = createSparkCapabilityContext({ id: 'toolbar', type: 'r-toolbar' }, root)
    toolbar.capabilities.set(HOST_VARIANT, 'toolbar')

    const btn = createSparkCapabilityContext({ id: 'btn', type: 'r-button' }, toolbar)

    const variant = consumeSparkCapability(btn, HOST_VARIANT)
    expect(variant).toBe('toolbar')
    expect(variant !== 'row-action').toBe(true)
  })

  it('动作能力通过 ACTION_CAPABILITY 独立提供', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    let executed = false
    const container = createSparkCapabilityContext({ id: 'container', type: 'r-table' }, root)
    container.capabilities.set(HOST_FIELD_MODE, 'table')
    container.capabilities.set(HOST_VARIANT, 'row-action')
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
