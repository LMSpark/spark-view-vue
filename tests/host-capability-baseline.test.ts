/**
 * Host 能力体系基线测试
 *
 * 重构前锚定以下核心行为，确保改造过程中不引入回归：
 * 1. findNearestHost 沿 ctx.parent 链找宿主，跳过无 host 的中间节点
 * 2. 宿主语义能力：fieldMode / variant 通过能力键读取
 * 3. RendererHostScope 有 row prop 时注入 DATA_ROW，无 row 时不覆盖父层
 * 4. useContainerHostBridge：externalHost 变 undefined 后行为
 * 5. variant === 'row-action' 时通过 HOST_VARIANT 能力分支
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import {
  Spark,
  ACTION_CAPABILITY,
  HOST_FIELD_MODE,
  HOST_VARIANT,
  normalizeKey,
  SPARK_REGISTRY_KEY,
  useSparkComponent,
  useSparkConsume,
  DATA_ROW,
} from '@spark-view/spark-component'
import type { SparkActionCapability, SparkNode, SparkHostLink } from '@spark-view/spark-component'
import { consumeSparkCapability, createActionCapability, createSparkCapabilityContext, findNearestHost } from '../packages/spark-component/src/core/capabilities'
import { useContainerHostBridge } from '../packages/spark-component/src/components/containers/composables/useContainerHostBridge'

// ═══════════════════════════════════════════════════════
// 1. findNearestHost — 纯上下文层测试
// ═══════════════════════════════════════════════════════

describe('findNearestHost — 上下文链逐层查找', () => {
  it('从 ctx.parent 开始查找，跳过自身', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.host = {}
    root.capabilities.set(normalizeKey(HOST_FIELD_MODE), 'form')

    const mid = createSparkCapabilityContext({ id: 'mid', type: 'section' }, root)
    // mid 不声明 host

    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, mid)
    leaf.host = {}
    // leaf 自身有 host，但 findNearestHost 应跳过自身

    const found = findNearestHost(leaf)
    // 应找到 root，而不是 leaf 自身（mid 无 host 被跳过）
    expect(found).not.toBeNull()
    expect(found!.host).toBeUndefined()
    expect(consumeSparkCapability<string>(leaf, HOST_FIELD_MODE)).toBe('form')
  })

  it('中间节点有 host 时返回最近一层', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    root.host = {}
    root.capabilities.set(normalizeKey(HOST_FIELD_MODE), 'form')

    const mid = createSparkCapabilityContext({ id: 'mid', type: 'table' }, root)
    mid.host = {}
    mid.capabilities.set(normalizeKey(HOST_FIELD_MODE), 'table')

    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, mid)

    const found = findNearestHost(leaf)
    // HOST = 父级；HOST.host = 爷爷级
    expect(found!.host).not.toBeUndefined()
    expect(consumeSparkCapability<string>(leaf, HOST_FIELD_MODE)).toBe('table')
  })

  it('无宿主时返回 null', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    const leaf = createSparkCapabilityContext({ id: 'leaf', type: 'field' }, root)

    expect(findNearestHost(leaf)).toBeNull()
  })

  it('根节点无 parent 时返回 null', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })
    expect(findNearestHost(root)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════
// 2. Vue 组件内宿主链路 — nearestHost() 行为
// ═══════════════════════════════════════════════════════

describe('Vue 组件内 nearestHost 宿主链路', () => {
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
        const { host, sparkProvide } = useSparkComponent({ type: 'r-form' } as SparkNode)
        host.setHost({})
        sparkProvide(HOST_FIELD_MODE, 'form')
        return () => h(Child)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { hostContext: rootContext })
        return () => h(Container)
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    expect(childFieldMode).toBe('form')
  })

  it('中间层无 host 时跳过，子组件读到更远的宿主', () => {
    let childFieldMode: string | undefined

    const Leaf = defineComponent({
      setup() {
        const { sparkConsume } = useSparkComponent({ type: 'r-text' } as SparkNode)
        childFieldMode = sparkConsume(HOST_FIELD_MODE) ?? undefined
        return () => h('span', 'leaf')
      },
    })

    const MiddleNoHost = defineComponent({
      setup() {
        useSparkComponent({ type: 'r-section' } as SparkNode)
        // 不调用 setHost，中间层透传
        return () => h(Leaf)
      },
    })

    const Container = defineComponent({
      setup() {
        const { host, sparkProvide } = useSparkComponent({ type: 'r-table' } as SparkNode)
        host.setHost({})
        sparkProvide(HOST_FIELD_MODE, 'table')
        return () => h(MiddleNoHost)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { hostContext: rootContext })
        return () => h(Container)
      },
    })

    mount(Root, {
      global: { provide: { [SPARK_REGISTRY_KEY as symbol]: registry } },
    })

    expect(childFieldMode).toBe('table')
  })

  it('useSparkConsume 也能通过 HOST_FIELD_MODE 读取最近宿主语义', () => {
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
        const { host, sparkProvide } = useSparkComponent({ type: 'r-detail' } as SparkNode)
        host.setHost({})
        sparkProvide(HOST_FIELD_MODE, 'detail')
        return () => h(Consumer)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { hostContext: rootContext })
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
    const HostScopeSimulator = defineComponent({
      props: {
        row: { type: Object, default: undefined },
        hostDef: { type: Object, default: undefined },
      },
      setup(props) {
        const { host, sparkProvide } = useSparkComponent({ type: 'r-host-data-scope' } as SparkNode)
        if (props.hostDef) {
          host.setHost(props.hostDef as SparkHostLink)
        }
        if (props.row !== undefined) {
          sparkProvide(DATA_ROW, props.row)
        }
        return () => h(RowConsumer)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        useSparkComponent({ type: 'page' } as SparkNode, { hostContext: rootContext })
        return () => h(HostScopeSimulator, {
          row: { name: 'Alice', age: 30 },
          hostDef: {},
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
        // 模拟无 row 的纯 host 作用域——不提供 DATA_ROW
        const { host } = useSparkComponent({ type: 'r-host-data-scope' } as SparkNode)
        host.setHost({})
        return () => h(RowConsumer)
      },
    })

    const { registry, rootContext } = createSystem()
    const Root = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'page' } as SparkNode, { hostContext: rootContext })
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
// 4. useContainerHostBridge — 桥接行为
// ═══════════════════════════════════════════════════════

describe('useContainerHostBridge 桥接行为', () => {
  it('externalHost 有值时 setHost 被调用', () => {
    let lastHost: SparkHostLink | null = null
    const localHost = {
      setHost(host: SparkHostLink | undefined) {
        lastHost = host ?? null
      },
    }
    const externalRef = computed<SparkHostLink | undefined>(() => ({}))

    // 在组件上下文中运行 watch 的 immediate
    const Wrapper = defineComponent({
      setup() {
        useContainerHostBridge(localHost, externalRef)
        return () => h('div')
      },
    })

    mount(Wrapper)

    expect(lastHost).not.toBeNull()
    expect(lastHost!.host).toBeUndefined()
  })

  it('externalHost 变为 undefined 时会清理旧代理', async () => {
    let setHostCallCount = 0
    let lastHost: SparkHostLink | null = null
    const localHost = {
      setHost(host: SparkHostLink | undefined) {
        setHostCallCount++
        lastHost = host ?? null
      },
    }

    const externalRef = ref<SparkHostLink | undefined>(undefined)
    const externalComputed = computed(() => externalRef.value)

    const Wrapper = defineComponent({
      setup() {
        useContainerHostBridge(localHost, externalComputed)
        return () => h('div')
      },
    })

    mount(Wrapper)

    // initial 值为 undefined，应主动清理本地 host
    expect(setHostCallCount).toBe(1)
    expect(lastHost).toBeNull()

    // 设置后应调用
    externalRef.value = {}
    await nextTick()
    expect(setHostCallCount).toBe(2)
    expect((lastHost as SparkHostLink | null)?.host).toBeUndefined()

    // 重新设为 undefined，应再次清理旧代理
    externalRef.value = undefined
    await nextTick()
    expect(setHostCallCount).toBe(3)
    expect(lastHost).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════
// 5. variant 字符串消费行为
// ═══════════════════════════════════════════════════════

describe('variant 消费行为', () => {
  it('HOST_VARIANT 能力可正常传递和读取', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    const table = createSparkCapabilityContext({ id: 'table', type: 'r-table' }, root)
    table.host = {}
    table.capabilities.set(normalizeKey(HOST_VARIANT), 'row-action')

    const button = createSparkCapabilityContext({ id: 'btn', type: 'r-button' }, table)

    expect(consumeSparkCapability(button, HOST_VARIANT)).toBe('row-action')
  })

  it('宿主有 HOST_VARIANT 时可用于样式分支判断', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    const toolbar = createSparkCapabilityContext({ id: 'toolbar', type: 'r-toolbar' }, root)
    toolbar.host = {}
    toolbar.capabilities.set(normalizeKey(HOST_VARIANT), 'toolbar')

    const btn = createSparkCapabilityContext({ id: 'btn', type: 'r-button' }, toolbar)

    const variant = consumeSparkCapability(btn, HOST_VARIANT)
    expect(variant).toBe('toolbar')
    expect(variant !== 'row-action').toBe(true)
  })

  it('动作能力通过 ACTION_CAPABILITY 独立提供', () => {
    const root = createSparkCapabilityContext({ id: 'root', type: 'page' })

    let executed = false
    const container = createSparkCapabilityContext({ id: 'container', type: 'r-table' }, root)
    container.host = {}
    container.capabilities.set(normalizeKey(HOST_FIELD_MODE), 'table')
    container.capabilities.set(normalizeKey(HOST_VARIANT), 'row-action')
    container.capabilities.set(normalizeKey(ACTION_CAPABILITY), createActionCapability({
      isDisabled: () => false,
      execute: () => { executed = true },
    }))

    const btn = createSparkCapabilityContext({ id: 'btn', type: 'r-button' }, container)
    const actionHost = consumeSparkCapability<SparkActionCapability>(btn, ACTION_CAPABILITY)

    expect(actionHost!.isDisabled({} as SparkNode)).toBe(false)
    actionHost!.execute({} as SparkNode)
    expect(executed).toBe(true)
  })
})
