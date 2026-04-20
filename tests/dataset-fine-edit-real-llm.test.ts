import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDomains,
  clearRegistry,
  createRepeatDetectionMonitor,
  createSession,
  executeStill,
  generateToolDefinitions,
  registerEditStills,
  runStillsLoop,
  type IStillSession,
  type SessionBackend,
  type ToolCall,
  type ToolDefinition,
} from '@spark-view/spark-ai'
import {
  DATASET_FINE_EDIT_TOOL_ACTIONS,
  buildFineGrainedEditContext,
  buildFineGrainedLoopSystemPrompt,
  buildFineGrainedLoopUserPrompt,
} from '../src/views/app/dev-system/datasetFineEditOrchestration'

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区 1：测试运行开关与真实模型配置
// 说明：
// - RUN_REAL_LLM_TESTS=1 时才执行真实集成测试，避免日常本地/CI 默认触发外部调用。
// - OPENAI_BASE_URL / OPENAI_API_KEY / AI_MODEL 用于直连真实 provider。
// ─────────────────────────────────────────────────────────────────────────────
const RUN_REAL = process.env['RUN_REAL_LLM_TESTS'] === '1'
const OPENAI_BASE_URL = process.env['OPENAI_BASE_URL']?.replace(/\/+$/, '')
const OPENAI_API_KEY = process.env['OPENAI_API_KEY']
const AI_MODEL = process.env['AI_MODEL'] || 'deepseek-chat'

// 当前 stills 会话实例（每条测试通过 beforeEach 重置）
let session: IStillSession

// provider 消息结构：与会话编排层 appendMessages/executeTurn 交互保持一致。
type ProviderMessage = {
  role: string
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

// 内存会话状态：用于测试侧 SessionBackend 的会话隔离。
type ProviderSessionState = {
  systemPrompt: string
  windowSize: number
  tools?: ToolDefinition[]
  conversation: ProviderMessage[]
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区 2：测试专用 SessionBackend（直连真实 provider）
// 设计目的：
// - 继续复用 runStillsLoop 的本地工具编排闭环；
// - 只替换“会话后端”这层，把 /api/ai/sessions 替换为直接调 provider；
// - 避免后端 stills session 的环境噪声影响真实 LLM 行为验证。
// ─────────────────────────────────────────────────────────────────────────────
class DirectProviderSessionBackend implements SessionBackend {
  private readonly sessions = new Map<string, ProviderSessionState>()

  // 创建会话：保存 system/user prompt 与 tools，后续 executeTurn 按该上下文调用模型。
  async createSession(systemPrompt: string, userPrompt: string, windowSize: number, tools?: ToolDefinition[]): Promise<string> {
    const sessionId = randomUUID()
    this.sessions.set(sessionId, {
      systemPrompt,
      windowSize,
      conversation: [{ role: 'user', content: userPrompt }],
      ...(tools !== undefined ? { tools } : {}),
    })
    return sessionId
  }

  // 执行一轮模型调用：
  // 1) 读取内存会话状态
  // 2) 拼接 system + conversation + tools 请求
  // 3) 返回 text/reasoning/toolCalls 给 orchestrator
  async executeTurn(sessionId: string): Promise<{ text: string; reasoning?: string; toolCalls?: ToolCall[] } | null> {
    const sessionState = this.sessions.get(sessionId)
    if (!sessionState) return null
    if (!OPENAI_BASE_URL || !OPENAI_API_KEY) {
      throw new Error('missing OPENAI_BASE_URL or OPENAI_API_KEY for real LLM test')
    }

    // 直连 provider Chat Completions。temperature/max_tokens 保持与项目默认策略一致。
    const response = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: this.buildMessages(sessionState),
        max_tokens: 8192,
        temperature: 0.3,
        ...(sessionState.tools && sessionState.tools.length > 0 ? { tools: sessionState.tools } : {}),
      }),
    })

    // 仅抽取本测试关注字段：error 与第一候选 message。
    const payload = await response.json() as {
      error?: { message?: string }
      choices?: Array<{
        message?: {
          content?: string | null
          reasoning_content?: string | null
          tool_calls?: ToolCall[]
        }
      }>
    }

    // fail-fast：把 provider 原始错误带回测试断言上下文，便于定位。
    if (!response.ok) {
      throw new Error(`provider call failed: ${response.status} ${JSON.stringify(payload.error ?? payload)}`)
    }

    const message = payload.choices?.[0]?.message
    if (!message) {
      throw new Error('provider call failed: missing first choice message')
    }

    // 兼容 text-only 与 tool-calls 两种回复形态。
    return {
      text: typeof message.content === 'string' ? message.content : '',
      ...(typeof message.reasoning_content === 'string' && message.reasoning_content
        ? { reasoning: message.reasoning_content }
        : {}),
      ...(Array.isArray(message.tool_calls) && message.tool_calls.length > 0
        ? { toolCalls: message.tool_calls }
        : {}),
    }
  }

  // 追加 assistant/tool 消息：由 orchestrator 在每轮 FC 后回灌到会话。
  async appendMessages(
    sessionId: string,
    messages: ProviderMessage[],
  ): Promise<void> {
    const sessionState = this.sessions.get(sessionId)
    if (!sessionState) return
    sessionState.conversation.push(...messages)
  }

  // 会话历史查询：当前测试不依赖完整细节，仅返回 role/content 即可。
  async getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const sessionState = this.sessions.get(sessionId)
    return sessionState?.conversation.map(message => ({
      role: message.role,
      content: message.content,
    })) ?? []
  }

  // 销毁单会话。
  async destroySession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  // 销毁全部会话。
  async destroyAllSessions(): Promise<void> {
    this.sessions.clear()
  }

  // 构建 provider messages：
  // - 保留完整 assistant.tool_calls -> tool 对应链路，
  //   避免 provider 报错“tool 消息缺少前置 tool_calls”。
  private buildMessages(sessionState: Pick<ProviderSessionState, 'systemPrompt' | 'conversation'>): Array<Record<string, unknown>> {
    return [
      { role: 'system', content: sessionState.systemPrompt },
      ...sessionState.conversation.map(message => ({
        role: message.role,
        content: message.content,
        ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      })),
    ]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区 3：测试前置隔离
// 说明：每条用例前重置 stills 注册表与域状态，避免上条用例污染。
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
})

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区 4：真实 LLM 全流程回归
// 验证目标：
// 1) 模型在 datasetTool.* 之前先查能力目录/动作规格；
// 2) 最终完成 dataset.export；
// 3) 导出 pagedata.json 确实包含新增 remark 字段与中文标签。
// ─────────────────────────────────────────────────────────────────────────────
describe('dataset fine edit real llm', () => {
  const realIt = RUN_REAL ? it : it.skip

  realIt('uses a real LLM to query capabilities/specs before editing and exporting', async () => {
    // 启动前的显式环境校验，避免无意义外部请求。
    if (!OPENAI_BASE_URL || !OPENAI_API_KEY) {
      throw new Error('missing OPENAI_BASE_URL or OPENAI_API_KEY for real LLM test')
    }

    // 初始化 edit-domain，构造最小可编辑 DataSet（Orders 仅含 id/orderNo）。
    const init = executeStill('edit.bootstrap', {
      ruleJson: [],
      pageDataJson: {
        dataSetName: 'PageDataSet',
        tables: {
          Orders: {
            tableName: 'Orders',
            columns: [
              { name: 'id', type: 'number', isPrimaryKey: true, label: 'ID' },
              { name: 'orderNo', type: 'string', label: '订单号' },
            ],
            views: { default: { rows: [] } },
          },
        },
        tableRelations: [],
      },
      scriptJs: '',
      styleCss: '',
    }, session, 'real-llm-init')
    expect(init.ok).toBe(true)

    // 供提示词注入的结构化模型摘要（减少模型对原始 JSON 细节依赖）。
    const context = buildFineGrainedEditContext({
      dataSetName: 'PageDataSet',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true, label: 'ID' },
            { name: 'orderNo', type: 'string', label: '订单号' },
          ],
          views: { default: { rows: [] } },
        },
      },
      tableRelations: [],
    })

    const backend = new DirectProviderSessionBackend()
    let sessionId = ''
    try {
      // 跑完整 stills FC 循环：真实 LLM 决策 + 本地 executeStill 执行 + tool result 回灌。
      const result = await runStillsLoop(
        buildFineGrainedLoopUserPrompt(
          '给 Orders 表新增 remark 字段，类型 string，标签 备注。严格先查能力目录，再查 actionSpec，再做最小修改，最后导出。',
          context,
        ),
        session,
        backend,
        {
          maxRounds: 10,
          slidingWindow: 12,
          systemPrompt: buildFineGrainedLoopSystemPrompt(),
          tools: generateToolDefinitions({
            actions: [...DATASET_FINE_EDIT_TOOL_ACTIONS],
            compactDescriptions: true,
          }),
          monitors: [
            // 重复调用防护：真实模型在异常场景下不应陷入同参死循环。
            createRepeatDetectionMonitor({
              maxSameSignature: 2,
              maxConsecutiveErrors: 2,
            }),
          ],
        },
      )
      sessionId = result.sessionId

      // 断言 1：编排未中止，且 export 已完成。
      expect(result.aborted).toBe(false)
      expect(result.exportCompleted).toBe(true)

      const actions = result.turns
        .filter(turn => turn.phase === 'stills-execute' && turn.toolBlock)
        .map(turn => turn.toolBlock!.action)

      // 断言 2：在首次 datasetTool.* 编辑前，必须先有 capabilities 与 actionSpec 探测。
      const firstEditIndex = actions.findIndex(action => action.startsWith('datasetTool.'))
      expect(firstEditIndex).toBeGreaterThan(-1)
      expect(actions.slice(0, firstEditIndex)).toContain('stills.capabilities')
      expect(actions.slice(0, firstEditIndex)).toContain('stills.actionSpec')
      expect(actions).toContain('dataset.export')

      // 断言 3：导出产物中包含目标字段与中文标签，证明真实写模成功。
      const exported = executeStill('dataset.export', {}, session, 'real-llm-export-check')
      expect(exported.ok).toBe(true)
      if (!exported.ok) return
      const pagedata = (exported.data as { file: { 'pagedata.json': string } }).file['pagedata.json']
      expect(pagedata).toContain('"remark"')
      expect(pagedata).toContain('"备注"')
    } finally {
      // 资源清理：避免后续测试遗留会话状态。
      if (sessionId) {
        await backend.destroySession(sessionId).catch(() => undefined)
      }
    }
  }, 300000)
})