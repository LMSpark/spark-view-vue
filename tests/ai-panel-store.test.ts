import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useAiPanelStore, type AiSessionConfig } from '@spark-view/spark-component'

function makeConfig(overrides: Partial<AiSessionConfig> = {}): AiSessionConfig {
  return {
    storageKey: 'test-storage-key',
    title: 'Test Session',
    placeholder: 'test placeholder',
    sender: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('useAiPanelStore', () => {
  beforeEach(() => {
    const store = useAiPanelStore()
    store.close()
    const current = store.getCurrentConfig()
    if (current) store.disposeIf(current)
  })

  it('is closed and empty by default', () => {
    const store = useAiPanelStore()
    expect(store.visible.value).toBe(false)
    expect(store.hasConfig.value).toBe(false)
    expect(store.storageKey.value).toBe('ai-panel-global')
    expect(store.title.value).toBe('AI 助手')
  })

  it('open() injects a descriptor and makes it visible', async () => {
    const store = useAiPanelStore()
    const descriptor = makeConfig()
    await store.open(descriptor)
    expect(store.visible.value).toBe(true)
    expect(store.hasConfig.value).toBe(true)
    expect(store.storageKey.value).toBe('test-storage-key')
    expect(store.title.value).toBe('Test Session')
    expect(store.sender.value).toBe(descriptor.sender)
  })

  it('close() hides the panel but keeps descriptor so header toggle can reopen it', async () => {
    const store = useAiPanelStore()
    const descriptor = makeConfig()
    await store.open(descriptor)
    store.close()
    expect(store.visible.value).toBe(false)
    expect(store.hasConfig.value).toBe(true)
    store.toggle()
    expect(store.visible.value).toBe(true)
    expect(store.sender.value).toBe(descriptor.sender)
  })

  it('open() replaces descriptor and storageKey re-mounts downstream widget via :key', async () => {
    const store = useAiPanelStore()
    const a = makeConfig({ storageKey: 'key-a', title: 'A' })
    const b = makeConfig({ storageKey: 'key-b', title: 'B' })
    await store.open(a)
    expect(store.storageKey.value).toBe('key-a')
    await store.open(b)
    expect(store.storageKey.value).toBe('key-b')
    expect(store.title.value).toBe('B')
    expect(store.sender.value).toBe(b.sender)
  })

  it('supports reactive storageKey via Ref, used for per-page history', async () => {
    const store = useAiPanelStore()
    const pageId = ref('page-1')
    const storageKey = ref(`devsystem-ai-chat:${pageId.value}`)
    const descriptor = makeConfig({ storageKey })
    await store.open(descriptor)
    expect(store.storageKey.value).toBe('devsystem-ai-chat:page-1')
    storageKey.value = 'devsystem-ai-chat:page-2'
    expect(store.storageKey.value).toBe('devsystem-ai-chat:page-2')
  })

  it('externalToolLogs proxies a Ref and updates reactively', async () => {
    const store = useAiPanelStore()
    const logs = ref<Array<{ type: 'info' | 'success' | 'error'; tag: string; text: string }>>([])
    await store.open(makeConfig({ externalToolLogs: logs }))
    expect(store.externalToolLogs.value).toEqual([])
    logs.value.push({ type: 'info', tag: 'test', text: 'hello' })
    expect(store.externalToolLogs.value).toHaveLength(1)
  })

  it('disposeIf() clears only when current descriptor matches', async () => {
    const store = useAiPanelStore()
    const a = makeConfig({ storageKey: 'a' })
    const b = makeConfig({ storageKey: 'b' })
    await store.open(a)
    store.disposeIf(b)
    expect(store.hasConfig.value).toBe(true)
    store.disposeIf(a)
    expect(store.hasConfig.value).toBe(false)
    expect(store.visible.value).toBe(false)
  })

  it('beforeOpen hook runs before the panel becomes visible', async () => {
    const store = useAiPanelStore()
    const beforeOpen = vi.fn(async () => {})
    const descriptor = makeConfig({ beforeOpen })
    await store.open(descriptor)
    expect(beforeOpen).toHaveBeenCalledTimes(1)
    expect(store.visible.value).toBe(true)
  })

  it('beforeOpen failure does not block the panel from opening', async () => {
    const store = useAiPanelStore()
    const beforeOpen = vi.fn(async () => {
      throw new Error('boom')
    })
    const descriptor = makeConfig({ beforeOpen })
    await store.open(descriptor)
    expect(store.visible.value).toBe(true)
  })

  it('sync() reruns beforeOpen and keeps the panel visible for context switching', async () => {
    const store = useAiPanelStore()
    const pageId = ref('page-1')
    const beforeOpen = vi.fn(async () => {})
    const descriptor = makeConfig({
      storageKey: () => `devsystem-ai-chat:${pageId.value}`,
      beforeOpen,
    })
    await store.open(descriptor)
    expect(store.visible.value).toBe(true)
    expect(store.storageKey.value).toBe('devsystem-ai-chat:page-1')

    pageId.value = 'page-2'
    await store.sync(descriptor)

    expect(beforeOpen).toHaveBeenCalledTimes(2)
    expect(store.visible.value).toBe(true)
    expect(store.storageKey.value).toBe('devsystem-ai-chat:page-2')
  })

  it('toggle() flips visibility without descriptor (empty-state allowed)', () => {
    const store = useAiPanelStore()
    expect(store.hasConfig.value).toBe(false)
    store.toggle()
    expect(store.visible.value).toBe(true)
    store.toggle()
    expect(store.visible.value).toBe(false)
  })

  it('exposes full-config getters (systemPrompt / toolGuide / toolCatalog / toolInstances / fcLoop / feedback)', async () => {
    const store = useAiPanelStore()
    const feedbackValue = ref('')
    const onSubmit = vi.fn()
    const handler = vi.fn()
    const catalog = [{ name: 'queryOrders', description: 'query', parameters: { type: 'object' } }]
    await store.open(
      makeConfig({
        systemPrompt: '你是助手',
        toolGuide: '先查再写',
        toolCatalog: catalog,
        toolInstances: { queryOrders: handler },
        fcLoop: { enabled: true, maxRounds: 5 },
        feedback: { value: feedbackValue, onSubmit },
      }),
    )
    expect(store.systemPrompt.value).toBe('你是助手')
    expect(store.toolGuide.value).toBe('先查再写')
    expect(store.toolCatalog.value).toEqual(catalog)
    expect(store.toolInstances.value?.['queryOrders']).toBe(handler)
    expect(store.fcLoop.value?.enabled).toBe(true)
    expect(store.feedback.value?.value).toBe(feedbackValue)
    expect(store.feedback.value?.onSubmit).toBe(onSubmit)
  })

  it('full-config getters return undefined when not provided', async () => {
    const store = useAiPanelStore()
    await store.open(makeConfig())
    expect(store.systemPrompt.value).toBeUndefined()
    expect(store.toolGuide.value).toBeUndefined()
    expect(store.toolCatalog.value).toBeUndefined()
    expect(store.toolInstances.value).toBeUndefined()
    expect(store.fcLoop.value).toBeUndefined()
    expect(store.feedback.value).toBeUndefined()
  })

  it('reactive systemPrompt / toolGuide via getter', async () => {
    const store = useAiPanelStore()
    const prompt = ref('v1')
    await store.open(makeConfig({ systemPrompt: () => prompt.value }))
    expect(store.systemPrompt.value).toBe('v1')
    prompt.value = 'v2'
    expect(store.systemPrompt.value).toBe('v2')
  })
})

describe('useAiPanelStore events', () => {
  beforeEach(() => {
    const store = useAiPanelStore()
    store.close()
    const current = store.getCurrentConfig()
    if (current) store.disposeIf(current)
  })

  it('emits open / opened on open()', async () => {
    const store = useAiPanelStore()
    const openSpy = vi.fn()
    const openedSpy = vi.fn()
    store.on('open', openSpy)
    store.on('opened', openedSpy)
    const cfg = makeConfig()
    await store.open(cfg)
    expect(openSpy).toHaveBeenCalledWith({ config: cfg })
    expect(openedSpy).toHaveBeenCalledWith({ config: cfg })
  })

  it('emits sync / synced on sync()', async () => {
    const store = useAiPanelStore()
    const syncSpy = vi.fn()
    const syncedSpy = vi.fn()
    store.on('sync', syncSpy)
    store.on('synced', syncedSpy)
    const a = makeConfig({ storageKey: 'key-a' })
    const b = makeConfig({ storageKey: 'key-b' })
    await store.open(a)
    await store.sync(b)
    expect(syncSpy).toHaveBeenCalledWith({ previousConfig: a, config: b })
    expect(syncedSpy).toHaveBeenCalledWith({ previousConfig: a, config: b })
  })

  it('emits close / closed on close()', async () => {
    const store = useAiPanelStore()
    const closeSpy = vi.fn()
    const closedSpy = vi.fn()
    store.on('close', closeSpy)
    store.on('closed', closedSpy)
    const cfg = makeConfig()
    await store.open(cfg)
    store.close()
    expect(closeSpy).toHaveBeenCalledWith({ config: cfg })
    expect(closedSpy).toHaveBeenCalledWith({ config: cfg })
  })

  it('emits dispose on disposeIf()', async () => {
    const store = useAiPanelStore()
    const disposeSpy = vi.fn()
    store.on('dispose', disposeSpy)
    const cfg = makeConfig()
    await store.open(cfg)
    store.disposeIf(cfg)
    expect(disposeSpy).toHaveBeenCalledWith({ config: cfg })
  })

  it('declarative hooks on config receive events', async () => {
    const store = useAiPanelStore()
    const onOpen = vi.fn()
    const onToolCall = vi.fn()
    const cfg = makeConfig({ hooks: { open: onOpen, 'tool:call': onToolCall } })
    await store.open(cfg)
    expect(onOpen).toHaveBeenCalledWith({ config: cfg })
    store.emit('tool:call', { toolName: 'queryOrders', args: { id: 1 }, round: 1 })
    expect(onToolCall).toHaveBeenCalledWith({ toolName: 'queryOrders', args: { id: 1 }, round: 1 })
  })

  it('on() returns unsubscribe, off() removes listener', async () => {
    const store = useAiPanelStore()
    const spy = vi.fn()
    const unsub = store.on('feedback:submit', spy)
    store.emit('feedback:submit', { text: 'nice' })
    unsub()
    store.emit('feedback:submit', { text: 'again' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ text: 'nice' })
  })

  it('listener throw does not break emit chain', () => {
    const store = useAiPanelStore()
    const spy = vi.fn()
    store.on('tool:call', () => { throw new Error('boom') })
    store.on('tool:call', spy)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.emit('tool:call', { toolName: 'x', args: null, round: 1 })
    expect(spy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
