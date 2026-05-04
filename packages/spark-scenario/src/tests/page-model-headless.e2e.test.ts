import { describe, expect, it } from 'vitest'
import { createScenarioFunctionCallBridge, createScenarioRuntime, runScenarioFunctionCalls } from '../index'
import {
  PAGE_MODEL_FILE_NAMES,
  PAGE_MODEL_EDIT_SCENARIO_ID,
  createFilePageModelHost,
  createMemoryAiScenarioSessionStore,
  createPageModelEditScenario,
  createPageModelFunctionLoopOptions,
  createPageModelHostRegistry,
  pageModelFunctionNameMapper,
  serializePageModelHostKey,
  type PageModelFileStorage,
  type PageModelFileTexts,
  type PageModelHostKey,
} from '../page-model'
import type { AiScenarioFunctionCall } from '../contracts/function-call-contracts'

const HOST_KEY: PageModelHostKey = {
  tenantId: 'tenant-a',
  projectId: 'project-a',
  pageId: 'page-a',
  sessionId: 'session-a',
}

const INITIAL_FILES: PageModelFileTexts = {
  'rule.json': '{ "type": "r-page", "id": "page-root", "children": [] }\n',
  'pagedata.json': '{ "dataSetName": "Demo", "tables": {} }\n',
  'script.js': 'export default {}\n',
  'style.css': '.page { color: red; }\n',
}

function cloneFiles(files: PageModelFileTexts): PageModelFileTexts {
  return {
    'rule.json': files['rule.json'],
    'pagedata.json': files['pagedata.json'],
    'script.js': files['script.js'],
    'style.css': files['style.css'],
  }
}

function createStorage(initialFiles: PageModelFileTexts = INITIAL_FILES) {
  let currentFiles = cloneFiles(initialFiles)
  const writeBatches: PageModelFileTexts[] = []
  const storage: PageModelFileStorage = {
    readText: (name) => Promise.resolve(currentFiles[name]),
    writeAllAtomically: (files) => {
      currentFiles = cloneFiles(files)
      writeBatches.push(cloneFiles(files))
      return Promise.resolve(PAGE_MODEL_FILE_NAMES)
    },
  }
  return {
    storage,
    readWrittenFiles: () => cloneFiles(currentFiles),
    writeBatches,
  }
}

function createE2eHarness() {
  const storageState = createStorage()
  const hostRegistry = createPageModelHostRegistry()
  const sessionStore = createMemoryAiScenarioSessionStore()
  const runtime = createScenarioRuntime([
    createPageModelEditScenario({
      hostRegistry,
      sessionStore,
      createHost: (key) => createFilePageModelHost({ key, storage: storageState.storage }),
    }),
  ])
  const bridge = createScenarioFunctionCallBridge(runtime, {
    functionNameMapper: pageModelFunctionNameMapper,
  })
  const context = { ...HOST_KEY }
  return { storageState, hostRegistry, sessionStore, runtime, bridge, context }
}

function runPageModelE2eFunctionCalls(
  calls: readonly AiScenarioFunctionCall[],
  options: Parameters<typeof createPageModelFunctionLoopOptions>[0],
) {
  return runScenarioFunctionCalls(calls, createPageModelFunctionLoopOptions(options))
}

function call(
  id: string,
  name: string,
  context: Omit<AiScenarioFunctionCall['context'] & PageModelHostKey, 'userInput'>,
  args?: Record<string, unknown>,
): AiScenarioFunctionCall {
  return {
    id,
    name,
    context,
    ...(args === undefined ? {} : { arguments: JSON.stringify(args) }),
  }
}

describe('page-model headless E2E', () => {
  it('runs runtime -> FC bridge -> file host -> validate -> commit as one headless flow', async () => {
    const { storageState, hostRegistry, sessionStore, runtime, bridge, context } = createE2eHarness()

    const definitions = bridge.listFunctionDefinitions().map((definition) => definition.name)
    expect(definitions).toEqual(expect.arrayContaining([
      'edit_open',
      'edit_ask',
      'edit_confirmRequirements',
      'sparkNodeTree_addNode',
      'sparkNodeTree_getAllData',
      'datasetTool_createTable',
      'datasetTool_export',
      'textModel_writeScript',
      'textModel_writeStyle',
      'edit_validate',
      'edit_commit',
      'edit_rollback',
    ]))
    expect(definitions).not.toContain('sparkNodeTree_replaceAllData')
    expect(definitions).not.toContain('datasetTool_replaceAllData')

    const nodeTreeTools = runtime.registry.queryScenarioTools({ scenarioId: PAGE_MODEL_EDIT_SCENARIO_ID, category: 'sparkNodeTree', limit: 100 })
    expect(nodeTreeTools.items.length).toBeGreaterThan(1)
    expect(nodeTreeTools.items.every((tool) => tool.category === 'sparkNodeTree')).toBe(true)
    expect(nodeTreeTools.items.map((tool) => tool.name)).toEqual(expect.arrayContaining(['sparkNodeTree.addNode', 'sparkNodeTree.setProps']))

    const editTools = runtime.registry.queryScenarioTools({ scenarioId: PAGE_MODEL_EDIT_SCENARIO_ID, category: 'edit', limit: 100 })
    expect(editTools.items.map((tool) => tool.name)).toEqual(expect.arrayContaining(['edit.ask', 'edit.confirmRequirements', 'edit.rollback']))

    const payloadInfo = runtime.registry.queryScenarioPayload(PAGE_MODEL_EDIT_SCENARIO_ID)
    const payloadKeys = payloadInfo?.payload?.slots?.map((slot) => slot.key) ?? []
    expect(payloadKeys).toEqual(expect.arrayContaining(['hostKey', 'requirements', 'sparkNode', 'componentProps', 'datasetTable', 'textContent']))
    const scenarioInfo = runtime.registry.queryScenarioInfo(PAGE_MODEL_EDIT_SCENARIO_ID)
    expect(scenarioInfo?.systemPrompt).toContain('具体业务需求与限制不预注册')
    expect(scenarioInfo?.systemPrompt).toContain('查询 edit.ask 的工具注册和参数 schema')
    expect(scenarioInfo?.systemPrompt).toContain('reason/questions/id/prompt/options/allowFreeform')
    const flowTools = runtime.registry.queryScenarioFlow(PAGE_MODEL_EDIT_SCENARIO_ID)?.flow.steps.flatMap((step) => step.tools ?? (step.tool === undefined ? [] : [step.tool])) ?? []
    expect(flowTools).toEqual(expect.arrayContaining(['edit.ask', 'edit.rollback']))
    expect(runtime.registry.queryScenarioCompletion(PAGE_MODEL_EDIT_SCENARIO_ID)?.completion).toMatchObject({
      mode: 'manual',
      tools: ['edit.validate', 'edit.commit'],
    })
    expect(runtime.registry.queryScenarioRecovery(PAGE_MODEL_EDIT_SCENARIO_ID)?.recovery[0]).toMatchObject({
      code: 'PAGE_MODEL_UNCOMMITTED_HEADLESS_RUN',
      tools: ['edit.inspect', 'edit.rollback', 'edit.validate', 'edit.commit'],
    })
    const componentPropsSlot = payloadInfo?.payload?.slots?.find((slot) => slot.key === 'componentProps')
    expect(componentPropsSlot?.description).toContain('Vue props')
    expect(componentPropsSlot?.description).toContain('catalog.guide')
    const componentPropsCapabilities = runtime.registry.queryScenarioCapabilities({
      scenarioId: PAGE_MODEL_EDIT_SCENARIO_ID,
      keyword: 'Vue props',
      limit: 50,
    })
    expect(componentPropsCapabilities.items.some((capability) => capability.id.endsWith('.payload.componentProps'))).toBe(true)

    const result = await runPageModelE2eFunctionCalls([
      call('open', 'edit_open', context),
      call('requirements', 'edit_confirmRequirements', context, {
        summary: '把页面改造成员工看板并保留 DevSystem 保存语义',
        constraints: ['不引入 @spark-view/spark-ai', 'headless 必须提交落盘'],
        assumptions: ['组件 catalog 由后续 DevSystem 集成提供'],
      }),
      call('add-node', 'sparkNodeTree_addNode', context, {
        parentComponentId: null,
        node: { type: 'r-card', id: 'employee-card', props: { title: '员工看板' }, children: [] },
      }),
      call('read-rule', 'sparkNodeTree_getAllData', context),
      call('create-table', 'datasetTool_createTable', context, {
        tableName: 'employee',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string', label: '姓名' },
        ],
      }),
      call('read-data', 'datasetTool_export', context),
      call('write-script', 'textModel_writeScript', context, {
        content: 'export default { mounted: true }\n',
      }),
      call('write-style', 'textModel_writeStyle', context, {
        content: '.page { color: blue; }\n',
      }),
      call('validate', 'edit_validate', context),
      call('commit', 'edit_commit', context),
    ], {
      bridge,
      sessionStore,
      sessionKey: HOST_KEY,
      hostRegistry,
      hostKey: HOST_KEY,
      requireHeadlessCommit: true,
    })

    expect(result).toMatchObject({ ok: true })
    expect(result.results).toHaveLength(10)
    expect(storageState.writeBatches).toHaveLength(1)
    expect(storageState.readWrittenFiles()).toEqual({
      'rule.json': '{\n  "type": "r-page",\n  "id": "page-root",\n  "children": [\n    {\n      "type": "r-card",\n      "id": "employee-card",\n      "props": {\n        "title": "员工看板"\n      },\n      "children": []\n    }\n  ]\n}\n',
      'pagedata.json': '{\n  "dataSetName": "Demo",\n  "tables": {\n    "employee": {\n      "tableName": "employee",\n      "columns": [\n        {\n          "name": "id",\n          "type": "number",\n          "isPrimaryKey": true\n        },\n        {\n          "name": "name",\n          "type": "string",\n          "label": "姓名"\n        }\n      ],\n      "views": {\n        "default": {\n          "tableName": "employee",\n          "viewId": "default"\n        }\n      }\n    }\n  }\n}\n',
      'script.js': 'export default { mounted: true }\n',
      'style.css': '.page { color: blue; }\n',
    })

    const host = hostRegistry.require(HOST_KEY)
    expect(host.getFlowState()).toMatchObject({ opened: true, requirementsConfirmed: true, validated: true, committed: true, dirty: false })
    await expect(sessionStore.get(HOST_KEY)).resolves.toMatchObject({
      requirements: { summary: '把页面改造成员工看板并保留 DevSystem 保存语义' },
      flowState: { committed: true },
      functionResults: Array.from({ length: 10 }, () => ({ ok: true })),
    })
  })

  it('fails the E2E loop when a headless run ends before commit', async () => {
    const { hostRegistry, sessionStore, bridge, context } = createE2eHarness()

    const result = await runPageModelE2eFunctionCalls([
      call('open', 'edit_open', context),
      call('requirements', 'edit_confirmRequirements', context, {
        summary: '只修改脚本但忘记提交',
        constraints: [],
        assumptions: [],
      }),
      call('write-script', 'textModel_writeScript', context, { content: 'changed\n' }),
    ], {
      bridge,
      sessionStore,
      sessionKey: HOST_KEY,
      hostRegistry,
      hostKey: HOST_KEY,
      requireHeadlessCommit: true,
    })

    expect(result).toMatchObject({ ok: false, error: 'Headless page model run finished without edit.commit.' })
    expect(hostRegistry.require(HOST_KEY).getFlowState()).toMatchObject({ dirty: true, committed: false })
    await expect(sessionStore.get(HOST_KEY)).resolves.toMatchObject({
      functionResults: [{ ok: true }, { ok: true }, { ok: true }],
    })
  })

  it('asks structured questions and rolls back uncommitted headless file changes', async () => {
    const { storageState, hostRegistry, sessionStore, bridge, context } = createE2eHarness()

    const result = await runPageModelE2eFunctionCalls([
      call('open', 'edit_open', context),
      call('ask', 'edit_ask', context, {
        reason: '缺少列表列定义和保存策略。',
        questions: [{ id: 'columns', prompt: '员工看板需要哪些列？', options: ['姓名', '部门', '状态'], allowFreeform: true }],
      }),
      call('requirements', 'edit_confirmRequirements', context, {
        summary: '先验证 rollback 能放弃未提交脚本修改',
        constraints: ['rollback 不应写入文件存储'],
        assumptions: [],
      }),
      call('write-script', 'textModel_writeScript', context, { content: 'dirty script\n' }),
      call('rollback', 'edit_rollback', context),
    ], {
      bridge,
      sessionStore,
      sessionKey: HOST_KEY,
      hostRegistry,
      hostKey: HOST_KEY,
    })

    expect(result).toMatchObject({ ok: true })
    expect(result.results[1]?.result).toMatchObject({ requiresUserInput: true })
    expect(hostRegistry.require(HOST_KEY).readFile('script.js')).toBe(INITIAL_FILES['script.js'])
    expect(hostRegistry.require(HOST_KEY).getFlowState()).toMatchObject({ dirty: false, committed: false })
    expect(storageState.writeBatches).toHaveLength(0)
    await expect(sessionStore.get(HOST_KEY)).resolves.toMatchObject({
      requirements: { summary: '先验证 rollback 能放弃未提交脚本修改' },
      functionResults: Array.from({ length: 5 }, () => ({ ok: true })),
    })
  })

  it('keeps concurrent E2E sessions isolated by tenant project page and session', async () => {
    const { hostRegistry, sessionStore, bridge } = createE2eHarness()
    const firstContext = { ...HOST_KEY }
    const secondContext: PageModelHostKey = { ...HOST_KEY, sessionId: 'session-b' }

    await runPageModelE2eFunctionCalls([
      call('first-open', 'edit_open', firstContext),
      call('first-requirements', 'edit_confirmRequirements', firstContext, { summary: '第一会话', constraints: [], assumptions: [] }),
      call('first-write', 'textModel_writeScript', firstContext, { content: 'first\n' }),
      call('first-commit', 'edit_commit', firstContext),
    ], { bridge, sessionStore, sessionKey: firstContext, hostRegistry, hostKey: firstContext, requireHeadlessCommit: true })

    await runPageModelE2eFunctionCalls([
      call('second-open', 'edit_open', secondContext),
      call('second-requirements', 'edit_confirmRequirements', secondContext, { summary: '第二会话', constraints: [], assumptions: [] }),
      call('second-write', 'textModel_writeScript', secondContext, { content: 'second\n' }),
      call('second-commit', 'edit_commit', secondContext),
    ], { bridge, sessionStore, sessionKey: secondContext, hostRegistry, hostKey: secondContext, requireHeadlessCommit: true })

    expect(hostRegistry.require(firstContext).readFile('script.js')).toBe('first\n')
    expect(hostRegistry.require(secondContext).readFile('script.js')).toBe('second\n')
    await expect(sessionStore.get(firstContext)).resolves.toMatchObject({ requirements: { summary: '第一会话' } })
    await expect(sessionStore.get(secondContext)).resolves.toMatchObject({ requirements: { summary: '第二会话' } })
    expect(serializePageModelHostKey(firstContext)).not.toBe(serializePageModelHostKey(secondContext))
  })

  it('returns page-model schema feedback for invalid params and continues later function calls', async () => {
    const { hostRegistry, sessionStore, bridge, context } = createE2eHarness()

    const result = await runPageModelE2eFunctionCalls([
      call('open', 'edit_open', context),
      call('invalid-script', 'textModel_writeScript', context, {}),
      call('inspect', 'edit_inspect', context),
    ], {
      bridge,
      sessionStore,
      sessionKey: HOST_KEY,
      hostRegistry,
      hostKey: HOST_KEY,
    })

    expect(result.ok).toBe(true)
    expect(result.results).toHaveLength(3)
    expect(result.results[1]).toMatchObject({ ok: true, status: 'executed' })
    expect(result.results[1]?.result).toMatchObject({
      ok: false,
      code: 'INVALID_PARAMS',
    })
    expect(JSON.stringify(result.results[1]?.result)).toContain('content')
    expect(JSON.stringify(result.results[1]?.result)).toContain('_followUp')
    expect(hostRegistry.require(HOST_KEY).readFile('script.js')).toBe(INITIAL_FILES['script.js'])
    await expect(sessionStore.get(HOST_KEY)).resolves.toMatchObject({
      functionResults: [{ ok: true }, { ok: true }, { ok: true }],
    })
  })
})
