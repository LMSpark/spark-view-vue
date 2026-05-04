import { describe, expect, it } from 'vitest'
import { createScenarioRegistry, type AiScenarioDefinition } from '../index'

// ==============================================
// 测试：scenario-registry 查询协议
// ==============================================
// 验证 queryIntentCatalog 及相关 query* 方法可直接调用、返回预期结构。
// 无副作用，无 mock，完全内存运行。

const leaveScenario: AiScenarioDefinition = {
  id: 'scenario.leave',
  title: '请假申请',
  intents: ['请假', '休假', '年假'],
  description: '员工发起请假申请流程',
  promptPolicy: { systemPrompt: '你是请假助手' },
  tools: [
    {
      name: 'leave.submit',
      description: '提交请假申请',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '请假天数' },
          reason: { type: 'string', description: '请假原因' },
        },
        required: ['days'],
      },
      registration: {
        category: 'leave',
        tags: ['request'],
        execution: { host: 'frontend', kind: 'tool' },
        functions: [
          {
            name: 'leave.submitDraft',
            description: '保存请假草稿',
            payloads: [
              {
                name: 'draftPayload',
                description: '草稿参数',
                schema: {
                  type: 'object',
                  properties: {
                    reason: { type: 'string', description: '请假原因' },
                  },
                },
              },
            ],
          },
          {
            name: 'leave.submitFinal',
            description: '提交正式请假申请',
            payloads: [
              {
                name: 'finalPayload',
                description: '正式提交参数',
                schema: {
                  type: 'object',
                  properties: {
                    days: { type: 'number', description: '请假天数' },
                    reason: { type: 'string', description: '请假原因' },
                  },
                  required: ['days'],
                },
              },
            ],
          },
        ],
      },
    },
    {
      name: 'leave.cancel',
      description: '撤销请假申请',
    },
  ],
}

const reimbursementScenario: AiScenarioDefinition = {
  id: 'scenario.reimbursement',
  title: '费用报销',
  intents: ['报销', '费用', '发票'],
  promptPolicy: { systemPrompt: '你是报销助手' },
  tools: [
    {
      name: 'reimburse.submit',
      description: '提交报销单',
    },
  ],
}

describe('scenario-registry 查询协议', () => {
  // ────────────────────────────────────────
  // queryIntentCatalog
  // ────────────────────────────────────────

  describe('queryIntentCatalog', () => {
    it('无参数直接调用，返回全部场景意图目录', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      const catalog = registry.queryIntentCatalog()

      expect(catalog.entries).toHaveLength(2)
      expect(catalog.entries.map((e) => e.scenarioId)).toEqual(['scenario.leave', 'scenario.reimbursement'])
    })

    it('每条 entry 包含 scenarioId / title / prompt / intents / summary', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const catalog = registry.queryIntentCatalog()
      const entry = catalog.entries[0]!

      expect(entry.scenarioId).toBe('scenario.leave')
      expect(entry.title).toBe('请假申请')
      expect(entry.prompt).toBe('你是请假助手')
      expect(entry.intents).toEqual(['请假', '休假', '年假'])
      // description 有值时 summary 直接用 description
      expect(entry.summary).toBe('员工发起请假申请流程')
    })

    it('无 description 时 summary 自动生成兜底文案', () => {
      const registry = createScenarioRegistry([reimbursementScenario])

      const entry = registry.queryIntentCatalog().entries[0]!

      // reimbursementScenario 无 description，应自动生成
      expect(typeof entry.summary).toBe('string')
      expect(entry.summary.length).toBeGreaterThan(0)
    })

    it('空注册中心返回空 entries', () => {
      const registry = createScenarioRegistry([])

      const catalog = registry.queryIntentCatalog()

      expect(catalog.entries).toHaveLength(0)
    })

    it('动态注册后再查询，新场景出现在目录中', () => {
      const registry = createScenarioRegistry([leaveScenario])

      registry.register(reimbursementScenario)
      const catalog = registry.queryIntentCatalog()

      expect(catalog.entries).toHaveLength(2)
      expect(catalog.entries.map((e) => e.scenarioId)).toContain('scenario.reimbursement')
    })

    it('unregister 后目录中不再包含该场景', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      registry.unregister('scenario.leave')
      const catalog = registry.queryIntentCatalog()

      expect(catalog.entries).toHaveLength(1)
      expect(catalog.entries[0]!.scenarioId).toBe('scenario.reimbursement')
    })
  })

  // ────────────────────────────────────────
  // queryScenarioInfo
  // ────────────────────────────────────────

  describe('queryScenarioInfo', () => {
    it('返回场景详情，含工具列表', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const info = registry.queryScenarioInfo('scenario.leave')!

      expect(info.scenarioId).toBe('scenario.leave')
      expect(info.tools).toHaveLength(2)
      expect(info.tools.map((t) => t.name)).toEqual(['leave.submit', 'leave.cancel'])
    })

    it('不存在的 scenarioId 返回 undefined', () => {
      const registry = createScenarioRegistry([])

      expect(registry.queryScenarioInfo('not.exist')).toBeUndefined()
    })
  })

  // ────────────────────────────────────────
  // queryScenarioTools
  // ────────────────────────────────────────

  describe('queryScenarioTools', () => {
    it('无 query 时返回全部工具', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      const page = registry.queryScenarioTools()

      expect(page.total).toBe(3) // leave.submit + leave.cancel + reimburse.submit
    })

    it('按 scenarioId 过滤', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      const page = registry.queryScenarioTools({ scenarioId: 'scenario.leave' })

      expect(page.total).toBe(2)
      expect(page.items.map((t) => t.name)).toEqual(['leave.submit', 'leave.cancel'])
    })

    it('按 keyword 过滤', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      const page = registry.queryScenarioTools({ keyword: '撤销' })

      expect(page.items).toHaveLength(1)
      expect(page.items[0]!.name).toBe('leave.cancel')
    })

    it('保留工具注册 category/tags/execution，并支持按 category 查询工具族', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      const page = registry.queryScenarioTools({ scenarioId: 'scenario.leave', category: 'leave' })

      expect(page.items).toHaveLength(1)
      expect(page.items[0]).toMatchObject({
        name: 'leave.submit',
        category: 'leave',
        tags: ['request'],
        execution: { host: 'frontend', kind: 'tool' },
      })
      expect(registry.queryScenarioInfo('scenario.leave')?.tools[0]).toMatchObject({ category: 'leave' })
    })
  })

  // ────────────────────────────────────────
  // queryToolSchema
  // ────────────────────────────────────────

  describe('queryToolSchema', () => {
    it('返回工具完整 schema，含 parameters', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const schema = registry.queryToolSchema('leave.submit')!

      expect(schema.toolName).toBe('leave.submit')
      expect(schema.parameters?.properties?.['days']).toBeDefined()
    })

    it('不存在的工具返回 undefined', () => {
      const registry = createScenarioRegistry([leaveScenario])

      expect(registry.queryToolSchema('not.exist')).toBeUndefined()
    })
  })

  // ────────────────────────────────────────
  // queryToolSchemaNode（下钻到字段节点）
  // ────────────────────────────────────────

  describe('queryToolSchemaNode', () => {
    it('pointer="/days" 定位到具体字段节点', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const node = registry.queryToolSchemaNode({ toolName: 'leave.submit', pointer: '/days' })!

      expect(node.pointer).toBe('/days')
      expect((node.schema as { type?: string }).type).toBe('number')
    })

    it('pointer="/" 返回根节点，childPointers 列出所有字段路径', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const root = registry.queryToolSchemaNode({ toolName: 'leave.submit', pointer: '/' })!

      expect(root.pointer).toBe('/')
      expect(root.childPointers).toContain('/days')
      expect(root.childPointers).toContain('/reason')
    })

    it('未命中节点返回 undefined', () => {
      const registry = createScenarioRegistry([leaveScenario])

      expect(registry.queryToolSchemaNode({ toolName: 'leave.submit', pointer: '/nonexistent' })).toBeUndefined()
    })
  })

  // ────────────────────────────────────────
  // queryToolFunctions（工具 -> 函数 -> payload）
  // ────────────────────────────────────────

  describe('queryToolFunctions', () => {
    it('优先返回显式注册的多函数映射', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const info = registry.queryToolFunctions('leave.submit')!

      expect(info.toolName).toBe('leave.submit')
      expect(info.functions).toHaveLength(2)
      expect(info.functions.map((item) => item.name)).toEqual(['leave.submitDraft', 'leave.submitFinal'])
      expect(info.functions[0]?.payloads?.[0]?.name).toBe('draftPayload')
      expect(info.functions[1]?.payloads?.[0]?.name).toBe('finalPayload')
    })

    it('未显式注册 functions 时返回兼容默认映射', () => {
      const registry = createScenarioRegistry([leaveScenario])

      const info = registry.queryToolFunctions('leave.cancel')!

      expect(info.functions).toHaveLength(1)
      expect(info.functions[0]?.name).toBe('leave.cancel')
      expect(info.functions[0]?.description).toBe('撤销请假申请')
    })

    it('不存在的工具返回 undefined', () => {
      const registry = createScenarioRegistry([leaveScenario])

      expect(registry.queryToolFunctions('not.exist')).toBeUndefined()
    })
  })

  // ────────────────────────────────────────
  // resolve（路由匹配）
  // ────────────────────────────────────────

  describe('resolve', () => {
    it('匹配关键词最长命中场景', () => {
      const registry = createScenarioRegistry([leaveScenario, reimbursementScenario])

      const result = registry.resolve('我要申请年假三天', { userInput: '我要申请年假三天' })!

      expect(result.scenario.id).toBe('scenario.leave')
      expect(result.score).toBeGreaterThan(0)
    })

    it('定义 identity.keywords 时按 keywords 进行匹配', () => {
      const keywordScenario: AiScenarioDefinition = {
        id: 'scenario.keyword',
        title: '团建费用报销',
        intents: ['无效关键词'],
        keywords: ['团建报销', '活动报销'],
        promptPolicy: { systemPrompt: '你是团建报销助手' },
        tools: [
          {
            name: 'reimburse.team.submit',
            description: '提交团建报销单',
          },
        ],
      }
      const registry = createScenarioRegistry([leaveScenario, keywordScenario])

      const result = registry.resolve('我要提一个团建报销申请', { userInput: '我要提一个团建报销申请' })!

      expect(result.scenario.id).toBe('scenario.keyword')
      expect(result.score).toBeGreaterThan(0)
    })

    it('无匹配时返回 undefined', () => {
      const registry = createScenarioRegistry([leaveScenario])

      expect(registry.resolve('查询天气预报', { userInput: '查询天气预报' })).toBeUndefined()
    })
  })
})
