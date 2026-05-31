import { describe, expect, it } from 'vitest'

import {
  AiAgentToolLoopRunner,
  createAiAgentHost,
  startAiAgentRegistrationSession,
  toAiAgentRuntimeScope,
  type AiAgentRuntimeContext,
  type AiAgentTurnCallbacks,
} from '@spark-view/spark-ai/agent'
import type { AiJsonValue } from '@spark-view/spark-ai/json'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessKindDefinition,
  createPageDesignBusinessRegistration,
  ensurePageDesignBusiness,
  type PageDesignRunInput,
} from '../src/ai'
import type { PageDesignEditHost } from '../src/page-model/update/page-edit-session'
import type { NavigationNodeDraft } from '../src/page-model/navigation/nav-editing'
import { SparkNodeTree } from '@spark-view/spark-data'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { PageDesignService } from '../src/page-model/update/page-design-service'
import { isRecord } from '@spark-view/spark-utils'
import { getArray, getRecord } from './helpers/test-utils'

function resultItemCount(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value['items'])) return 0
  return value['items'].length
}

function resultStepCount(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value['steps'])) return 0
  return value['steps'].length
}

function createHost(options: { script?: string; style?: string } = {}): {
  host: PageDesignEditHost
  reads: () => { script: string; style: string; nodeChanged: number; dataChanged: number; navTitle: string; navIcon: string }
  nodeTree: SparkNodeTree
  dataSetTool: DataSetCrudTool
} {
  let script = options.script ?? 'export default {}'
  let style = options.style ?? '.page { color: red; }'
  let nodeChanged = 0
  let dataChanged = 0
  let navDraft: NavigationNodeDraft = {
    id: 'page-node',
    title: '未命名页面',
    icon: 'Document',
    nodeKind: 'page' as const,
    dividerAfter: false,
    description: '',
    path: '/page-design-test',
    redirect: '',
    linkTarget: 'iframe' as const,
    parentPageId: '',
    childPlacement: '',
    order: 0,
    hidden: false,
    disabled: false,
    refId: '',
    permissionMode: 'masked' as const,
  }
  const nodeTree = SparkNodeTree.fromJson({ type: 'page', props: {}, children: [] })
  const dataSetTool = new DataSetCrudTool('page-design-test')
  return {
    host: {
      getNodeTree: () => nodeTree,
      onNodeTreeChanged: () => { nodeChanged += 1 },
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => { dataChanged += 1 },
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
      getNavDraft: () => navDraft,
      onNavDraftChanged: (patch) => { navDraft = { ...navDraft, ...patch } },
    },
    reads: () => ({ script, style, nodeChanged, dataChanged, navTitle: navDraft.title, navIcon: navDraft.icon }),
    nodeTree,
    dataSetTool,
  }
}

function hostContext(pageId: string): AiAgentRuntimeContext {
  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: pageId,
    instanceId: pageId,
  }
}

function businessScope(pageId: string) {
  return {
    businessRegistrationId: PAGE_DESIGN_MODULE_ID,
    businessInstanceId: pageId,
    instanceId: pageId,
    runtimeInstanceId: pageId,
  }
}

function testTurn() {
  return {
    turnId: 'turn-page-design-submodule',
    seq: 1,
    baseRevision: 0,
    queuedAt: '2026-05-21T00:00:00.000Z',
    startedAt: '2026-05-21T00:00:00.000Z',
    maxParallelTurns: 1,
  }
}

function expectActionSummariesOnly(describeData: Record<string, unknown>): void {
  const functions = describeData['functions']
  if (!Array.isArray(functions)) throw new Error('functions not array')
  for (const fn of functions) {
    if (!isRecord(fn)) throw new Error('function not record')
    expect(fn).toHaveProperty('name')
    expect(fn).toHaveProperty('functionName')
    expect(fn).toHaveProperty('description')
    expect(fn).not.toHaveProperty('paramsSchema')
    expect(fn).not.toHaveProperty('usageRules')
    expect(fn).not.toHaveProperty('failureModes')
  }
}

function expectFunctionGuideComplete(guideData: Record<string, unknown>): void {
  expect(guideData).toHaveProperty('paramsSchema')
  expect(guideData).toHaveProperty('usageRules')
  expect(guideData).toHaveProperty('failureModes')
  expect(guideData).toHaveProperty('examples')
}

function assertPageDesignRunInputTypes(): void {
  const { host } = createHost()
  const aiHost = createAiAgentHost({
    turnCallbacks: {
      executeTurn: () => Promise.resolve({ text: 'ok', toolCalls: [] }),
      appendMessages: () => Promise.resolve(),
    },
    maxToolRounds: 1,
  })
  const pageDesignHost = ensurePageDesignBusiness({
    host: aiHost,
    getPageDesignEditHost: () => host,
  })

  void pageDesignHost.run(PAGE_DESIGN_MODULE_ID, { pageId: 'page-designer', userRequirement: '实现页面' })
}

void assertPageDesignRunInputTypes

function actionNames(describeData: Record<string, unknown>): string[] {
  const functions = describeData['functions']
  if (!Array.isArray(functions)) throw new Error('functions not array')
  return functions.map((fn) => isRecord(fn) && typeof fn['name'] === 'string' ? fn['name'] : '')
}

function executeDesignTool(
  registration: ReturnType<typeof createPageDesignBusinessRegistration>,
  toolName: string,
  args: Readonly<Record<string, AiJsonValue>>,
  context: AiAgentRuntimeContext,
) {
  return registration.runtime.executeTool(toolName, args, context)
}

function pageDesignCall(
  childKind: string,
  functionName: string,
  args: Readonly<Record<string, AiJsonValue>> = {},
  pageId = 'page-designer',
): Readonly<Record<string, AiJsonValue>> {
  return {
    path: `/${PAGE_DESIGN_MODULE_ID}[${pageId}]/${childKind}[${pageId}]`,
    functionName,
    args,
  }
}

function pageDesignDirectCall(
  childKind: string,
  args: Readonly<Record<string, AiJsonValue>> = {},
  pageId = 'page-designer',
): Readonly<Record<string, AiJsonValue>> {
  return {
    path: `/${PAGE_DESIGN_MODULE_ID}[${pageId}]/${childKind}[${pageId}]`,
    args,
  }
}

describe('pageDesign host business registration', () => {
  it('lets the page-design service be manually orchestrated without an AI session', async () => {
    const { host, reads } = createHost()
    const service = new PageDesignService({ getEditHost: () => host })
    const context = {
      pageId: 'manual-page',
      requestId: 'manual-run',
    }

    expect(service.bootstrap(context)).toMatchObject({ ok: true, data: { phase: 'editing' } })
    expect(service.readTextModel(context, 'script')).toMatchObject({ ok: true, data: { content: 'export default {}' } })
    expect(service.writeTextModel(context, 'script', 'export default { manual: true }')).toMatchObject({ ok: true })
    expect(reads().script).toBe('export default { manual: true }')

    const counted = await service.runNodeTreeAction(context, {}, {
      serviceLabel: 'countNodes',
      mutates: false,
      run: (tree) => tree.countNodes(),
    })
    expect(counted).toMatchObject({ ok: true, data: 1 })
    expect(service.getState(context).phase).toBe('editing')
  })

  it('detects production stages from the PageNode snapshot before mapping to flow steps', () => {
    const page = createHost({ script: 'export default {}', style: '.page {}' })
    const service = new PageDesignService({ getEditHost: () => page.host })
    const context = {
      pageId: 'stage-page',
      requestId: 'stage-run',
    }

    expect(service.bootstrap(context)).toMatchObject({ ok: true })
    const initialProgress = service.describeProgress(context)
    if (!initialProgress.ok) throw new Error(initialProgress.msg)
    const initialProgressData = initialProgress.data
    if (!isRecord(initialProgressData) || !isRecord(initialProgressData['stageDetection'])) throw new Error('expected stage detection')
    const initialDetection = initialProgressData['stageDetection']
    expect(initialDetection['sourceOfTruth']).toBe('PageNode')
    expect(initialDetection['decisionOrder']).toEqual(['PageNode', '100-step-flow', 'four-file-edit'])
    expect(initialDetection['finalReady']).toBe(false)
    if (!Array.isArray(initialDetection['nextActions'])) throw new Error('expected next actions')
    expect(initialDetection['nextActions'][0]).toContain('standard-page.buildManagementWorkbench')

    const assembled = service.buildManagementWorkbench(context, {
      title: '学生成绩管理',
      entityName: 'StudentGrade',
      fields: [
        { name: 'studentName', label: '学生姓名', type: 'string', role: 'title', required: true },
        { name: 'className', label: '班级', type: 'string', role: 'group' },
        { name: 'subject', label: '科目', type: 'string', role: 'category', options: ['语文', '数学'] },
        { name: 'score', label: '成绩', type: 'number', role: 'score' },
      ],
      filters: ['班级', '科目'],
      metrics: ['学生数', '平均分', '优秀人数'],
      primaryAction: '保存成绩',
    })
    expect(assembled).toMatchObject({ ok: true })

    const readyProgress = service.describeProgress(context)
    if (!readyProgress.ok) throw new Error(readyProgress.msg)
    const readyProgressData = readyProgress.data
    if (!isRecord(readyProgressData) || !isRecord(readyProgressData['stageDetection'])) throw new Error('expected ready stage detection')
    const detection = readyProgressData['stageDetection']
    expect(detection['sourceOfTruth']).toBe('PageNode')
    expect(detection['finalReady']).toBe(true)
    expect(detection['nextPhase']).toBe(null)

    if (!isRecord(detection['metrics'])) throw new Error('expected metrics')
    const metrics = detection['metrics']
    expect(metrics['tableCount']).toBe(1)
    expect(Number(metrics['dataViewBindingCount'])).toBeGreaterThan(0)

    if (!Array.isArray(detection['phases'])) throw new Error('expected phases')
    const phases = detection['phases']
    const dependencyPhase = phases.find((item) => isRecord(item) && item['phase'] === '视图依赖')
    expect(isRecord(dependencyPhase) ? dependencyPhase['status'] : null).toBe('ready')
  })

  it('registers pageDesign as root kind with standard parts and low-level child AiModule kinds', async () => {
    const { host } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    const started = await startAiAgentRegistrationSession(registration, context)

    expect(registration.moduleId).toBe(PAGE_DESIGN_MODULE_ID)
    expect(registration.description).toBe('页面 PageNode 生产线。')
    expect(started.tools.map((tool) => tool.function.name)).toEqual(expect.arrayContaining([
      'module_query',
      'module_guide',
      'module_attribute_guide',
      'module_function_guide',
      'module_find',
      'module_attr',
      'module_call',
      'human_question',
      'describeProgress',
      'buildManagementWorkbench',
      'writeScript',
      'writeStyle',
      'addNodes',
      'createTable',
      'queryPayloads',
      'guidePayload',
    ]))

    const listed = await executeDesignTool(registration, 'module_find', { path: '/' }, context)
    const ids = getArray(listed).map((entry) => isRecord(entry) ? entry['id'] : null)
    expect(ids).toEqual([PAGE_DESIGN_MODULE_ID])

    const rootFound = await executeDesignTool(registration, 'module_find', {
      path: '/',
      childKind: PAGE_DESIGN_MODULE_ID,
      query: {},
    }, context)
    const rootInstances = getArray(rootFound)
    const rootInstance = rootInstances[0]
    expect(isRecord(rootInstance) ? rootInstance['id'] : null).toBe('page-designer')

    const rootDescription = getRecord(await executeDesignTool(registration, 'module_guide', {
      kind: PAGE_DESIGN_MODULE_ID,
    }, context))
    expect(rootDescription['children']).toEqual(['lifecycle', 'standard-page', 'text-model', 'payload-catalog', 'node-tree', 'dataset'])

    const childRefs = getArray(await executeDesignTool(registration, 'module_find', {
      path: '/pageDesign[page-designer]',
    }, context))
    expect(childRefs).toHaveLength(6)

    for (const kind of ['lifecycle', 'standard-page', 'text-model', 'payload-catalog', 'node-tree', 'dataset']) {
      const found = await executeDesignTool(registration, 'module_find', {
        path: '/pageDesign[page-designer]',
        childKind: kind,
        query: {},
      }, context)
      const instances = getArray(found)
      expect(isRecord(instances[0]) ? instances[0]['id'] : null).toBe('page-designer')

      const described = await executeDesignTool(registration, 'module_guide', { kind }, context)
      const description = getRecord(described)
      expect(description['parentKind']).toBe(PAGE_DESIGN_MODULE_ID)
      expectActionSummariesOnly(description)
      const functions = description['functions']
      if (!Array.isArray(functions)) throw new Error('functions not array')
      const firstFunction = functions.find((fn) => isRecord(fn) && typeof fn['functionName'] === 'string')
      if (isRecord(firstFunction) && typeof firstFunction['functionName'] === 'string') {
        const guide = getRecord(await executeDesignTool(registration, 'module_function_guide', {
          kind,
          functionName: firstFunction['functionName'],
        }, context))
        expectFunctionGuideComplete(guide)
      }
    }

    const payloadDescription = getRecord(await executeDesignTool(registration, 'module_guide', {
      kind: 'payload-catalog',
    }, context))
    expect(actionNames(payloadDescription)).toEqual(['queryPayloads', 'guidePayload'])

    const nodeTreeDescription = getRecord(await executeDesignTool(registration, 'module_guide', {
      kind: 'node-tree',
    }, context))
    expect(nodeTreeDescription['payloads']).toEqual([
      {
        payloadRef: 'spark.component',
        description: 'SparkNode 组件 props 参数目录；LLM 写目录组件前必须显式 guidePayload，node-tree 写入时也会按 type 自动提取指南并兜底校验 props。',
        requiredForFunctions: ['addNode', 'addNodes', 'replaceNode', 'replaceNodes', 'setProps', 'setPropsBatch'],
      },
    ])
  })

  it('exposes a page-config owned pageDesign Host helper', async () => {
    const { host } = createHost()
    const streamInputs: string[] = []
    const requestedPageIds: string[] = []
    const aiHost = createAiAgentHost({
      turnCallbacks: {
        executeTurn: (input) => {
          streamInputs.push(input.messages.map((message) => message.content).join('\n'))
          return Promise.resolve({ text: 'ok', toolCalls: [] })
        },
        appendMessages: () => Promise.resolve(),
      },
      maxToolRounds: 1,
    })

    const pageDesignHost = ensurePageDesignBusiness({
      host: aiHost,
      getPageDesignEditHost: (context) => {
        requestedPageIds.push(context.moduleInstanceId)
        return host
      },
    })

    const input: PageDesignRunInput = {
      pageId: 'page-designer',
      userRequirement: '实现请假申请页面',
    }
    const result = await pageDesignHost.run(PAGE_DESIGN_MODULE_ID, input)

    expect(pageDesignHost.has(PAGE_DESIGN_MODULE_ID)).toBe(true)
    expect(result.task.normalizedInput['pageId']).toBe('page-designer')
    expect(result.task.normalizedInput['userRequirement']).toBe('实现请假申请页面')
    expect(streamInputs).toEqual(['实现请假申请页面'])
    expect(requestedPageIds).toContain('page-designer')
  })

  it('creates pageDesign task through Host alias instead of a bare target', async () => {
    const { host } = createHost()
    const definition = createPageDesignBusinessKindDefinition({ getEditToolHost: () => host })
    const prompts: string[] = []
    const pageDesignHost = ensurePageDesignBusiness({
      host: createAiAgentHost({
        turnCallbacks: {
          executeTurn: (input) => {
            prompts.push(input.systemPrompt)
            return Promise.resolve({ text: 'ok', toolCalls: [] })
          },
          appendMessages: () => Promise.resolve(),
        },
        maxToolRounds: 1,
      }),
      getPageDesignEditHost: () => host,
    })

    expect(definition.kindID).toBe(PAGE_DESIGN_MODULE_ID)
    expect(definition.inputContract.identityField).toBe('pageId')

    const result = await pageDesignHost.run(PAGE_DESIGN_MODULE_ID, {
      pageId: ' page-designer ',
      userRequirement: '  实现请假申请页面  ',
    })
    const prompt = prompts.join('\n')

    const { task } = result
    expect(task.target.businessRegistrationId).toBe(PAGE_DESIGN_MODULE_ID)
    expect(task.target.businessInstanceId).toBe('page-designer')
    expect(task.normalizedInput).toMatchObject({
      pageId: 'page-designer',
      userRequirement: '实现请假申请页面',
    })
    expect(prompt).not.toContain('AI Host 任务输入')
    expect(prompt).toContain('kindID=pageDesign')
    expect(prompt).toContain('"pageId":"page-designer"')
    expect(prompt).toContain('工具通道硬约束')
    expect(prompt).toContain('真实 tool_calls')
    expect(prompt).toContain('tool_calls 数组长度必须为 1')
    expect(prompt).toContain('禁止在同一轮并行发起多个查询或写入')
    expect(prompt).toContain('直接函数参数规则')
    expect(prompt).toContain('SSOT 规则')
    expect(prompt).toContain('最小可验收门禁')
    expect(prompt).toContain('function.name="module_find"')
    expect(prompt).toContain('function.arguments={"path":"/","childKind":"pageDesign","query":{"id":"page-designer"}}')
    expect(prompt).toContain('禁止在正文输出 {"tool_call":...}')
    expect(prompt).toContain('无正文')
    expect(prompt).toContain('Host 返回 ref.id 后')
    expect(prompt).toContain('每轮只调用一个真实 tool_call')
    expect(prompt).toContain('describeProgress({"path"')
    expect(prompt).toContain('describeDesignFlow({"path"')
    expect(prompt).toContain('"intent":messages[0].content')
    expect(prompt).toContain('阶段成果门禁')
    expect(prompt).toContain('入口(1-10) -> 盘点(11-20)')
    expect(prompt).toContain('写入建议：通常先让数据事实支撑 UI')
  })

  it('carries pageDesign mode and operation boundaries into the 100-step orchestration', () => {
    const { host } = createHost()
    const definition = createPageDesignBusinessKindDefinition({ getEditToolHost: () => host })
    const plan = definition.inputContract.toOrchestration({
      pageId: 'page-designer',
      userRequirement: '只调整数据模型',
      mode: 'data',
      allowedOperations: {
        addTables: true,
        addComponents: false,
        editScript: false,
        editStyle: false,
      },
      preserveExistingInteractions: true,
    })

    expect(plan.systemPrompt).toContain('模式边界：mode=data')
    expect(plan.systemPrompt).toContain('操作边界：新增表=允许新增组件=禁止改脚本=禁止改样式=禁止')
    expect(plan.systemPrompt).toContain('保留边界：保留现有页面交互')
    const readonlySteps = plan.readonlySteps ?? []
    expect(readonlySteps).toContain('preserve existing interactions before editing rule/script')
    expect(readonlySteps.some(step => step.includes('100-step phase gates'))).toBe(true)
  })

  it('rejects pageDesign run inputs that do not satisfy the registered schema', async () => {
    const { host } = createHost()
    const pageDesignHost = ensurePageDesignBusiness({
      host: createAiAgentHost({
        turnCallbacks: {
          executeTurn: () => Promise.resolve({ text: 'ok', toolCalls: [] }),
          appendMessages: () => Promise.resolve(),
        },
        maxToolRounds: 1,
      }),
      getPageDesignEditHost: () => host,
    })

    await expect(pageDesignHost.run(PAGE_DESIGN_MODULE_ID, {
      pageId: 'page-designer',
    })).rejects.toThrow('failed schema validation')
  })

  it('executes lifecycle/text-model/payload-catalog/node-tree/dataset through protocol tools', async () => {
    const { host, reads } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    await startAiAgentRegistrationSession(registration, context)

    const bootstrap = await executeDesignTool(registration, 'module_call', pageDesignCall('lifecycle', 'bootstrap'), context)
    expect(bootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })

    const designFlow = await executeDesignTool(registration, 'module_call', pageDesignCall('lifecycle', 'describeDesignFlow', {
      phase: '入口',
      afterStep: 10,
    }), context)
    expect(resultStepCount(getRecord(designFlow))).toBe(10)

    const writeScript = await executeDesignTool(registration, 'writeScript', pageDesignDirectCall('text-model', {
      content: 'export default { mounted() {} }',
    }), context)
    expect(writeScript.ok).toBe(true)
    expect(reads().script).toBe('export default { mounted() {} }')

    const longSignatureScript = await executeDesignTool(registration, 'writeScript', pageDesignDirectCall('text-model', {
      content: 'function handleSubmit(form, row, table, page) { return form }',
    }), context)
    expect(longSignatureScript.ok).toBe(false)
    expect(longSignatureScript.checks?.[0]?.code).toBe('INVALID_SCRIPT_RUNTIME_API')
    expect(longSignatureScript.checks?.[0]?.message).toContain('长位置参数函数签名')
    expect(reads().script).toBe('export default { mounted() {} }')

    const readScript = await executeDesignTool(registration, 'readScript', pageDesignDirectCall('text-model'), context)
    expect(readScript).toMatchObject({ ok: true, data: { content: 'export default { mounted() {} }' } })

    const payloads = await executeDesignTool(registration, 'queryPayloads', pageDesignDirectCall('payload-catalog', {
      key: 'r-button',
      limit: 1,
    }), context)
    const payloadCatalog = getRecord(payloads)
    expect(payloadCatalog).toMatchObject({
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
    })
    expect(resultItemCount(payloadCatalog)).toBe(1)
    const payloadItems = payloadCatalog['items']
    if (!Array.isArray(payloadItems) || !isRecord(payloadItems[0])) throw new Error('expected payload item')
    expect(payloadItems[0]['key']).toBe('r-button')
    expect(payloadItems[0]['moduleKind']).toBe('node-tree')
    expect(payloadItems[0]['payloadRef']).toBe('spark.component')

    const payloadGuide = await executeDesignTool(registration, 'guidePayload', pageDesignDirectCall('payload-catalog', {
      key: 'r-button',
    }), context)
    const payloadGuideData = getRecord(payloadGuide)
    expect(payloadGuideData).toMatchObject({
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
    })
    const guidedPayload = payloadGuideData['payload']
    if (!isRecord(guidedPayload)) throw new Error('expected payload guide record')
    expect(guidedPayload['key']).toBe('r-button')
    expect(guidedPayload['moduleKind']).toBe('node-tree')
    expect(guidedPayload['payloadRef']).toBe('spark.component')
    const paramsSchema = guidedPayload['paramsSchema']
    if (!isRecord(paramsSchema) || !isRecord(paramsSchema['properties'])) {
      throw new Error('expected payload paramsSchema properties')
    }
    expect(paramsSchema['type']).toBe('object')
    expect(paramsSchema['properties']).toHaveProperty('action')
    expect(paramsSchema['properties']).toHaveProperty('label')

    const displayPayloads = await executeDesignTool(registration, 'queryPayloads', pageDesignDirectCall('payload-catalog', {
      key: 'display-statistic',
      limit: 1,
    }), context)
    expect(resultItemCount(getRecord(displayPayloads))).toBe(1)

    const displayGuide = await executeDesignTool(registration, 'guidePayload', pageDesignDirectCall('payload-catalog', {
      key: 'display-statistic',
    }), context)
    expect(displayGuide.ok).toBe(true)

    const recommendedFields = await executeDesignTool(registration, 'queryPayloads', pageDesignDirectCall('payload-catalog', {
      category: 'field',
      configurableOnly: true,
      limit: 5,
    }), context)
    const recommendedFieldCatalog = getRecord(recommendedFields)
    const fieldItems = recommendedFieldCatalog['items']
    if (!Array.isArray(fieldItems)) throw new Error('expected recommended field items')
    expect(fieldItems.map((item) => isRecord(item) ? item['key'] : null)).toEqual([
      'r-text',
      'r-select',
      'r-date',
      'r-number',
      'r-textarea',
    ])
    expect(fieldItems.every((item) => isRecord(item) && item['configurable'] === true)).toBe(true)

    const countNodes = await executeDesignTool(registration, 'countNodes', pageDesignDirectCall('node-tree'), context)
    expect(countNodes).toMatchObject({ ok: true, data: 1 })

    const listTables = await executeDesignTool(registration, 'listTables', pageDesignDirectCall('dataset'), context)
    expect(listTables).toMatchObject({ ok: true, data: [] })
  })

  it('enforces data-first node writes and requires guides for every written component', async () => {
    const { host } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    await startAiAgentRegistrationSession(registration, context)

    const addBeforeDataset = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'r-form',
        id: 'guided-form',
        props: { dataViewKey: 'LeaveRequest@default', contextDataMember: 'currentRow' },
        children: [
          { type: 'r-text', id: 'guided-name', props: { field: 'applicantName' } },
        ],
      },
    }), context)
    expect(addBeforeDataset.ok).toBe(false)
    if (addBeforeDataset.ok) throw new Error('expected data-first failure')
    expect(JSON.stringify(addBeforeDataset.checks ?? [])).toContain('DATASET_FIRST_REQUIRED')

    const createDataset = await executeDesignTool(registration, 'module_call', pageDesignCall('dataset', 'createTable', {
      tableName: 'LeaveRequest',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'applicantName', type: 'string' },
      ],
      resourceType: 'database-table',
      resourceId: 'hr.leave_request',
      views: { default: {} },
    }), context)
    expect(createDataset.ok).toBe(true)

    const addInvalidProps = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'r-form',
        id: 'guided-form',
        props: { dataViewKey: 'LeaveRequest@default', contextDataMember: 'currentRow', gridColumns: 'two' },
        children: [
          { type: 'r-text', id: 'guided-name', props: { field: 'applicantName' } },
        ],
      },
    }), context)
    expect(addInvalidProps.ok).toBe(false)
    if (addInvalidProps.ok) throw new Error('expected payload schema failure')
    const invalidPropsChecks = JSON.stringify(addInvalidProps.checks ?? [])
    expect(invalidPropsChecks).toContain('NODE_PAYLOAD_SCHEMA_INVALID')
    expect(invalidPropsChecks).toContain('gridColumns')

    const addWithAutoGuides = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'r-form',
        id: 'guided-form',
        props: { dataViewKey: 'LeaveRequest@default', contextDataMember: 'currentRow' },
        children: [
          { type: 'r-text', id: 'guided-name', props: { field: 'applicantName' } },
        ],
      },
    }), context)
    expect(addWithAutoGuides.ok).toBe(true)

    const addNativeType = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'div',
        id: 'native-wrapper',
        props: {},
        children: ['原生说明文案'],
      },
    }), context)
    expect(addNativeType.ok).toBe(true)

    const addDisplayCatalogType = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'display-statistic',
        id: 'display-statistic-node',
        props: { title: '待审批申请' },
      },
    }), context)
    expect(addDisplayCatalogType.ok).toBe(true)

    const addUnknownType = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'mystery-widget',
        id: 'unknown-widget',
        props: {},
      },
    }), context)
    expect(addUnknownType).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'UNKNOWN_NODE_TYPE' })],
    })
  })

  it('requires contextDataMember when form nodes bind a DataView', async () => {
    const { host } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    await startAiAgentRegistrationSession(registration, context)

    const createDataset = await executeDesignTool(registration, 'module_call', pageDesignCall('dataset', 'createTable', {
      tableName: 'LeaveRequest',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'applicantName', type: 'string' },
      ],
      resourceType: 'database-table',
      resourceId: 'hr.leave_request',
      views: { default: {} },
    }), context)
    expect(createDataset.ok).toBe(true)

    for (const key of ['r-form', 'r-text']) {
      const guide = await executeDesignTool(registration, 'module_call', pageDesignCall('payload-catalog', 'guidePayload', {
        key,
      }), context)
      expect(guide.ok).toBe(true)
    }

    const missingContext = await executeDesignTool(registration, 'module_call', pageDesignCall('node-tree', 'addNode', {
      parentComponentId: 'page__0',
      node: {
        type: 'r-form',
        id: 'form-without-context',
        props: { dataViewKey: 'LeaveRequest@default' },
        children: [
          { type: 'r-text', id: 'field-name', props: { field: 'applicantName' } },
        ],
      },
    }), context)
    expect(missingContext.ok).toBe(false)
    if (missingContext.ok) throw new Error('expected contextDataMember failure')
    expect(JSON.stringify(missingContext.checks ?? [])).toContain('CONTEXT_DATA_MEMBER_REQUIRED')
  })

  it('AI tool loop can discover child modules and invoke payload guides through direct paths', async () => {
    const pageId = 'page-designer'
    const { host, reads } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const scope = businessScope(pageId)
    const context = hostContext(pageId)
    await startAiAgentRegistrationSession(registration, context)

    const statuses: string[] = []
    const roundToolNames: string[][] = []
    let streamRound = 0
    const scriptedToolCalls = [
      {
        id: 'discover-root',
        type: 'function' as const,
        function: {
          name: 'module_find',
          arguments: JSON.stringify({ path: '/' }),
        },
      },
      {
        id: 'find-root',
        type: 'function' as const,
        function: {
          name: 'module_find',
          arguments: JSON.stringify({ path: '/', childKind: PAGE_DESIGN_MODULE_ID, query: {} }),
        },
      },
      {
        id: 'discover-child',
        type: 'function' as const,
        function: {
          name: 'module_find',
          arguments: JSON.stringify({ path: `/pageDesign[${pageId}]` }),
        },
      },
      {
        id: 'find-child',
        type: 'function' as const,
        function: {
          name: 'module_find',
          arguments: JSON.stringify({
            path: `/pageDesign[${pageId}]`,
            childKind: 'text-model',
            query: {},
          }),
        },
      },
      {
        id: 'find-payload-catalog',
        type: 'function' as const,
        function: {
          name: 'module_find',
          arguments: JSON.stringify({
            path: `/pageDesign[${pageId}]`,
            childKind: 'payload-catalog',
            query: {},
          }),
        },
      },
      {
        id: 'describe-child',
        type: 'function' as const,
        function: {
          name: 'module_guide',
          arguments: JSON.stringify({ kind: 'text-model' }),
        },
      },
      {
        id: 'describe-payload-catalog',
        type: 'function' as const,
        function: {
          name: 'module_guide',
          arguments: JSON.stringify({ kind: 'payload-catalog' }),
        },
      },
      {
        id: 'query-payloads',
        type: 'function' as const,
        function: {
          name: 'queryPayloads',
          arguments: JSON.stringify({
            path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
            args: { key: 'r-button', limit: 1 },
          }),
        },
      },
      {
        id: 'guide-payload',
        type: 'function' as const,
        function: {
          name: 'guidePayload',
          arguments: JSON.stringify({
            path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
            args: { key: 'r-button' },
          }),
        },
      },
      {
        id: 'invoke-child',
        type: 'function' as const,
        function: {
          name: 'writeScript',
          arguments: JSON.stringify({
            path: `/pageDesign[${pageId}]/text-model[${pageId}]`,
            args: { content: 'export default { aiSubmoduleAddressed: true }' },
          }),
        },
      },
    ]
    const turnCallbacks: AiAgentTurnCallbacks = {
      executeTurn: (input) => {
        roundToolNames.push(input.tools.map((tool) => tool.function.name))
        streamRound += 1
        const toolCall = scriptedToolCalls[streamRound - 1]
        if (toolCall !== undefined) {
          return Promise.resolve({
            text: '',
            toolCalls: [toolCall],
          })
        }
        return Promise.resolve({ text: 'done', toolCalls: [] })
      },
      appendMessages: () => Promise.resolve(),
    }
    const runner = new AiAgentToolLoopRunner(turnCallbacks, scriptedToolCalls.length + 1)

    await runner.runToolLoop({
      registration,
      scope,
      request: { historyMsgs: [], onToolCall: (record) => statuses.push(record.status) },
      turn: testTurn(),
      clearSelected: () => undefined,
    })

    expect(roundToolNames).toHaveLength(scriptedToolCalls.length + 1)
    expect(roundToolNames[0]).not.toContain('invokeAction')
    expect(roundToolNames[0]).toEqual(expect.arrayContaining([
      'module_query',
      'module_guide',
      'module_attribute_guide',
      'module_function_guide',
      'module_find',
      'module_attr',
      'module_call',
      'human_question',
      'queryPayloads',
      'guidePayload',
      'writeScript',
    ]))
    expect(statuses).toEqual([
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
    ])
    expect(reads().script).toBe('export default { aiSubmoduleAddressed: true }')

    const history = registration.sessionStore?.getSessionHistory(context) ?? []
    const functionCalls = history.filter((entry) => entry.kind === 'functionCall')
    expect(functionCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolName: 'queryPayloads',
        status: 'completed',
        args: {
          path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
          args: { key: 'r-button', limit: 1 },
        },
      }),
      expect.objectContaining({
        toolName: 'guidePayload',
        status: 'completed',
        args: {
          path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
          args: { key: 'r-button' },
        },
      }),
    ]))
    expect(functionCalls.at(-1)).toMatchObject({
      kind: 'functionCall',
      toolName: 'writeScript',
      status: 'completed',
      args: {
        path: `/pageDesign[${pageId}]/text-model[${pageId}]`,
        args: { content: 'export default { aiSubmoduleAddressed: true }' },
      },
    })
  })

  it('rejects agent_complete until the broad page deliverable gate is satisfied', async () => {
    const page = createHost({ script: 'export default {}', style: '.page {}' })
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: () => page.host,
    })
    const context = hostContext('student-grade-page')

    await expect(Promise.resolve(registration.beforeFunctionCall?.({
      ...context,
      toolName: 'agent_complete',
      args: { summary: 'done' },
    }))).resolves.toMatchObject({
      status: 'reject',
      fix: expect.stringContaining('最终验收未通过'),
    })

    page.dataSetTool.createTable({
      tableName: 'StudentGrade',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'studentName', type: 'string' },
        { name: 'score', type: 'number' },
      ],
      resourceType: 'static-data',
      views: {
        default: {
          rows: [{ id: 'g-1', studentName: 'Alice', score: 92 }],
        },
      },
    })
    page.nodeTree.replaceRoot({
      type: 'page',
      id: 'student-grade-workbench',
      children: [
        {
          type: 'r-section',
          id: 'grade-summary',
          props: { title: '学生成绩管理' },
          children: ['学生成绩管理'],
        },
        {
          type: 'r-table',
          id: 'grade-table-zone',
          props: {
            dataViewKey: 'StudentGrade@default',
            dataMember: 'rows',
            rowKey: 'id',
          },
        },
        {
          type: 'r-form',
          id: 'grade-form-zone',
          props: {
            dataViewKey: 'StudentGrade@default',
            contextDataMember: 'currentRow',
          },
          children: [
            { type: 'r-text', id: 'grade-student-name', props: { field: 'studentName' } },
            { type: 'r-number', id: 'grade-score', props: { field: 'score' } },
          ],
        },
      ],
    })
    page.host.writeScript?.([
      'export default {',
      '  methods: {',
      '    gradeLevel(score) { if (score >= 90) return "优秀"; if (score >= 80) return "良好"; return "待提升" },',
      '    isAbnormal(score) { return score < 0 || score > 100 },',
      '  },',
      '}',
    ].join('\n'))
    page.host.writeStyle?.([
      '.student-grade-workbench { display: grid; gap: 16px; padding: 20px; background: #f6f8fb; color: #1f2937; }',
      '.student-grade-workbench .summary { display: flex; align-items: center; justify-content: space-between; border: 1px solid #d8dee9; padding: 14px; }',
      '.student-grade-workbench .filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }',
      '.student-grade-workbench .table { min-height: 280px; border: 1px solid #ccd4e0; background: #fff; }',
      '.student-grade-workbench .warning { color: #b45309; font-weight: 600; }',
    ].join('\n'))

    await expect(Promise.resolve(registration.beforeFunctionCall?.({
      ...context,
      toolName: 'agent_complete',
      args: { summary: 'done' },
    }))).resolves.toMatchObject({ status: 'allow' })
  })

  it('assembles a management workbench through a deterministic standard part', async () => {
    const page = createHost({ script: 'export default {}', style: '.page {}' })
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: () => page.host,
    })
    const context = hostContext('employee-page')
    await startAiAgentRegistrationSession(registration, context)

    const result = await executeDesignTool(registration, 'buildManagementWorkbench', {
      path: '/pageDesign[employee-page]/standard-page[employee-page]',
      args: {
        title: '员工信息管理',
        entityName: 'Employee',
        fields: [
          { name: 'name', label: '姓名', type: 'string', role: 'title', required: true },
          { name: 'department', label: '部门', type: 'string', role: 'department', options: ['研发部', '人事部'] },
          { name: 'status', label: '状态', type: 'string', role: 'status', options: ['在职', '试用', '离职'] },
          { name: 'hireDate', label: '入职日期', type: 'date', role: 'date' },
        ],
        filters: ['部门', '状态'],
        metrics: ['员工总数', '在职人数', '试用人数'],
        primaryAction: '保存档案',
      },
    }, context)

    expect(result).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        tableName: 'employee',
        dataViewKey: 'employee@default',
        standardPart: 'management-workbench',
      }),
    })
    expect(Object.keys(page.dataSetTool.toJson().tables)).toEqual(['employee'])
    expect(page.nodeTree.countNodes()).toBeGreaterThan(8)
    expect(page.reads().script.length).toBeGreaterThan(180)
    expect(page.reads().style.length).toBeGreaterThan(400)
    expect(page.reads().navTitle).toBe('员工信息管理')
  })

  it('fails fast when live adapter is missing', async () => {
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: () => ({
        readScript: () => '',
        readStyle: () => '',
      }),
    })
    const context = hostContext('page-designer')
    await expect(startAiAgentRegistrationSession(registration, context)).rejects.toThrow('PageDesignService.bootstrap')
  })

  it('isolates parallel page-design instances and accepts route-like page ids', async () => {
    const pageA = createHost({ script: 'export default { page: "A" }' })
    const pageB = createHost({ script: 'export default { page: "B" }' })
    const requestedPageIds: string[] = []
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: (context) => {
        requestedPageIds.push(context.moduleInstanceId)
        return context.moduleInstanceId === 'page-a' ? pageA.host : pageB.host
      },
    })

    const contextA = hostContext('page-a')
    const contextB = hostContext('page-b')
    await startAiAgentRegistrationSession(registration, contextA)
    await startAiAgentRegistrationSession(registration, contextB)

    await executeDesignTool(registration, 'module_call', pageDesignCall('lifecycle', 'bootstrap', {}, 'page-a'), contextA)
    await executeDesignTool(registration, 'module_call', pageDesignCall('lifecycle', 'bootstrap', {}, 'page-b'), contextB)
    await executeDesignTool(registration, 'module_call', pageDesignCall('text-model', 'writeScript', {
      content: 'export default { page: "A", changed: true }',
    }, 'page-a'), contextA)

    expect(pageA.reads().script).toBe('export default { page: "A", changed: true }')
    expect(pageB.reads().script).toBe('export default { page: "B" }')

    const nestedContext = hostContext('lmspark/homepage')
    await startAiAgentRegistrationSession(registration, nestedContext)
    const nestedBootstrap = await executeDesignTool(
      registration,
      'module_call',
      pageDesignCall('lifecycle', 'bootstrap', {}, 'lmspark/homepage'),
      nestedContext,
    )

    expect(nestedBootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })
    expect(toAiAgentRuntimeScope({
      businessRegistrationId: PAGE_DESIGN_MODULE_ID,
      businessInstanceId: 'lmspark/homepage',
      instanceId: 'lmspark/homepage',
      runtimeInstanceId: 'lmspark/homepage',
    })).toEqual(nestedContext)
    expect(requestedPageIds).toEqual(expect.arrayContaining(['page-a', 'page-b', 'lmspark/homepage']))
  })
})
