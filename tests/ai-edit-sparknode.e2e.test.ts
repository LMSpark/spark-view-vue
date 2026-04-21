/**
 * Real LLM E2E Verification — Edit Domain SparkNodeTree Build
 *
 * 验证：真实 LLM ↔ Agent 之间通过新一代 edit.* 工具链构建 SparkNodeTree 的能力。
 * 全链路验证：LLM 理解提示词 -> 解析 edit 工具流 -> Java Backend 传递 SSE 消息 -> Agent 本地执行(bootstrap/queryCatalog/addNode) -> 回传 Backend 继续对话。
 */

import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  registerEditStills,
  createSession,
  executeStill,
} from '../packages/spark-ai/src/stills/index'
import { getEditState } from '../packages/spark-ai/src/stills/edit-state'
import { runStillsLoop } from '../packages/spark-ai/src/runtime/session-orchestrator'
import { SessionBackendImpl, configureSessionBackend } from '../packages/spark-ai/src/session-backend'

const BASE_URL = process.env['AI_BACKEND_URL']?.replace(/\/+$/, '') || 'http://localhost:8080'
const AUTH_TENANT_ID = process.env['AI_TENANT_ID'] || 'lmspark'
const AUTH_USERNAME = process.env['AI_USERNAME'] || 'admin'
const AUTH_PASSWORD = process.env['AI_PASSWORD'] || 'admin123'
const DEFAULT_COMM_LOG_PATH = 'data/ai-edit-sparknode-comm-log.json'
const DEFAULT_READABLE_COMM_LOG_PATH = 'data/ai-edit-sparknode-comm-log.readable.json'
let authToken = ''

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!(text.startsWith('{') || text.startsWith('['))) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function toReadableConversation(
  conversation: Array<{ role: string; content: string }>,
): Array<Record<string, unknown>> {
  return conversation.map((message) => {
    const rawMessage = message as unknown as Record<string, unknown>
    const readableMessage: Record<string, unknown> = { ...rawMessage }

    const contentParsed = tryParseJsonString(rawMessage['content'])
    if (contentParsed !== undefined) {
      readableMessage['contentParsed'] = contentParsed
    }

    const toolCalls = rawMessage['tool_calls']
    if (Array.isArray(toolCalls)) {
      readableMessage['toolCallsParsed'] = toolCalls.map((toolCall) => {
        if (typeof toolCall !== 'object' || toolCall === null) return toolCall

        const rawToolCall = toolCall as Record<string, unknown>
        const readableToolCall: Record<string, unknown> = { ...rawToolCall }
        const rawFn = rawToolCall['function']

        if (typeof rawFn === 'object' && rawFn !== null) {
          const rawFnObj = rawFn as Record<string, unknown>
          const argsParsed = tryParseJsonString(rawFnObj['arguments'])
          if (argsParsed !== undefined) {
            readableToolCall['functionParsed'] = {
              ...rawFnObj,
              argumentsParsed: argsParsed,
            }
          }
        }

        return readableToolCall
      })
    }

    return readableMessage
  })
}

const AUTONOMOUS_SYSTEM_PROMPT = [
  '你是稳定优先的前端组装代理。',
  '你只能依据已确认的 schema 或节点状态行动，不得猜测未知字段。',
  '你可以自主决策动作组合与执行顺序，但必须满足任务目标与底线约束。',
].join(' ')

const AUTONOMOUS_GUARDRAILS = `执行底线约束（稳定优先，必须遵守）：
1) 本任务只允许以下动作：stills.actionSpec、sparkNodeTree.hasNode、sparkNodeTree.getNode、sparkNodeTree.listChildren、sparkNodeTree.setProps、sparkNodeTree.addNode、sparkNodeTree.addNodes、sparkNodeTree.replaceNode、sparkNodeTree.replaceNodes、sparkNodeTree.removeNode、sparkNodeTree.removeNodes、sparkNodeTree.countNodes；其它动作即使在能力表中出现也视为本任务不可用；
2) 不要求调用 stills.capabilities；仅在必要时查询 stills.actionSpec，且只查询将要写入的组件类型；
3) 关键写动作前先确认参数结构与字段含义，不猜测、不假设未知字段；
4) 不做同参数重复查询；仅在发生相关写入后，才允许再次读取同一目标状态；
5) 目标态校验采用“写后统一校验”，避免每轮重复自检；
6) 最终反馈必须包含：执行动作、关键参数摘要、目标态校验结果。`

async function login(): Promise<void> {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': AUTH_TENANT_ID,
    },
    body: JSON.stringify({
      tenantId: AUTH_TENANT_ID,
      username: AUTH_USERNAME,
      password: AUTH_PASSWORD,
    }),
  })
  if (!resp.ok) {
    throw new Error(`Login failed HTTP ${resp.status}`)
  }
  const payload = await resp.json()
  authToken = payload.token
}

describe('Real LLM E2E Verification — Edit Domain SparkNodeTree Build', () => {
  // 只在配置了环境变量时才运行，避免 CI/CD 失败
  const runRealAI = process.env['RUN_REAL_AI'] === 'true'
  
  it.skipIf(!runRealAI)('验证：真实 LLM ↔ Agent 之间通过新一代 edit.* 工具链构建 SparkNodeTree 的能力（基础 addNode）', async () => {
    console.info(`[E2E] 1. 登录 tenant=${AUTH_TENANT_ID} user=${AUTH_USERNAME}...`)
    await login()
    console.info(`[E2E] 🔑 已获取 Token`)

    // 配置前端 SessionBackend
    configureSessionBackend({
      getHeaders: () => ({
        Authorization: `Bearer ${authToken}`,
        'X-Tenant-Id': AUTH_TENANT_ID,
      }),
      onSseEvent: (e) => {
        if (e.type === 'tool_calls') {
          console.info(`   [LLM 动作发出] ${e.data}`)
        } else if (e.type === 'message') {
          console.info(`   [LLM 推理] ${e.data}`)
        }
      }
    })

    // 创建业务前端状态
    registerEditStills()
    const session = createSession()

    const seededBootstrap = executeStill('edit.bootstrap', {
      ruleJson: [
        {
          id: 'root-table',
          type: 'r-table',
          props: { dataKey: 'Departments@default' },
          children: [],
        },
      ],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }, session, 'seed-bootstrap')
    expect(seededBootstrap.ok).toBe(true)

    const seededCreateTable = executeStill('datasetTool.createTable', {
      tableName: 'Departments',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'count', type: 'number' },
      ],
      resourceType: 'static-data',
      businessCategory: 'master',
    }, session, 'seed-create-table')
    expect(seededCreateTable.ok).toBe(true)

    const seededDatasetExport = executeStill('dataset.export', {}, session, 'seed-dataset-export')
    expect(seededDatasetExport.ok).toBe(true)

    const backend = new SessionBackendImpl(`${BASE_URL}/api/ai/sessions`)

    const prompt = `当前会话已经完成 edit.bootstrap 且已执行 dataset.export，数据阶段已完成。
任务目标：在 root-table 下新增一个 r-text 子节点，节点为
{
  "type": "r-text",
  "id": "dept-name-field",
  "props": {
    "field": "name",
    "label": "部门名称"
  }
}

${AUTONOMOUS_GUARDRAILS}

你自主决策具体执行方案，达成目标后给出结构化总结。`

    console.info(`[E2E] 2. 启动 LLM Stills 循环调度...\n`)

    const result = await runStillsLoop(prompt, session, backend, {
      maxRounds: 8,
      slidingWindow: 30,
      systemPrompt: AUTONOMOUS_SYSTEM_PROMPT,
    })

    console.info(`\n[E2E] 3. 循环结束. rounds=${result.rounds} aborted=${result.aborted}`)
    const lastAiTurn = [...result.turns].reverse().find((turn) => typeof turn.aiText === 'string' && turn.aiText.length > 0)
    console.info(`[E2E] AI 最终回复：${lastAiTurn?.aiText ?? ''}`)

    const state = getEditState(session)
    const ruleNodes = state.nodeTree?.toJSON()?.children ?? []
    const conversation = await backend.getConversation(result.sessionId)
    const conversationReadable = toReadableConversation(conversation)

    mkdirSync('data', { recursive: true })
    const commLog = {
      generatedAt: new Date().toISOString(),
      scenario: 'basic',
      backendBaseUrl: BASE_URL,
      sessionId: result.sessionId,
      prompt,
      seededState: {
        bootstrapOk: seededBootstrap.ok,
        createTableOk: seededCreateTable.ok,
        datasetExportOk: seededDatasetExport.ok,
      },
      rounds: result.rounds,
      aborted: result.aborted,
      abortReason: result.abortReason,
      turns: result.turns,
      executedActions: result.turns
        .map((turn) => turn.toolBlock?.action)
        .filter((action): action is string => typeof action === 'string'),
      backendConversation: conversation,
      backendConversationReadable: conversationReadable,
      ruleNodes,
    }
    const commLogPath = 'data/ai-edit-sparknode-comm-log.basic.json'
    const readableLogPath = 'data/ai-edit-sparknode-comm-log.basic.readable.json'
    writeFileSync(readableLogPath, JSON.stringify(commLog, null, 2), 'utf-8')
    writeFileSync(commLogPath, JSON.stringify(commLog, null, 2), 'utf-8')
    writeFileSync(DEFAULT_READABLE_COMM_LOG_PATH, JSON.stringify(commLog, null, 2), 'utf-8')
    writeFileSync(DEFAULT_COMM_LOG_PATH, JSON.stringify(commLog, null, 2), 'utf-8')

    console.info(`[E2E] 4. 本地树状态检验：`)
    console.info(JSON.stringify(ruleNodes, null, 2))
    console.info(`[E2E] 5. 完整通讯日志已写入：${commLogPath}`)
    console.info(`[E2E] 6. 可读通讯日志已写入：${readableLogPath}`)
    console.info(`[E2E] 7. 默认可读通讯日志已更新：${DEFAULT_READABLE_COMM_LOG_PATH}`)
    console.info(`[E2E] 8. 默认通讯日志已更新：${DEFAULT_COMM_LOG_PATH}`)

    const executedActions = result.turns
      .map((turn) => turn.toolBlock?.action)
      .filter((action): action is string => typeof action === 'string')

    const usedCatalogQuery = executedActions.some((action) => action === 'catalog.query' || action === 'stills.actionSpec')
    const usedTreeWrite = executedActions.some((action) =>
      action === 'sparkNodeTree.addNode'
      || action === 'sparkNodeTree.addNodes'
      || action === 'sparkNodeTree.replaceNode'
      || action === 'sparkNodeTree.replaceNodes',
    )

    const successfulTreeWrite = result.turns.some((turn) => {
      const action = turn.toolBlock?.action
      if (action === undefined) return false
      const isTreeWrite = action === 'sparkNodeTree.addNode'
        || action === 'sparkNodeTree.addNodes'
        || action === 'sparkNodeTree.replaceNode'
        || action === 'sparkNodeTree.replaceNodes'
      return isTreeWrite && turn.stillsResult?.ok === true
    })

    const hasStillsExecution = result.turns.some((turn) => turn.phase === 'stills-execute' && turn.stillsResult !== undefined)

    expect(usedCatalogQuery).toBe(true)
    expect(usedTreeWrite).toBe(true)
    expect(hasStillsExecution).toBe(true)
    expect(result.aborted).toBe(false)
    expect(Array.isArray(ruleNodes)).toBe(true)
    expect(ruleNodes.length).toBeGreaterThan(0)
    expect(successfulTreeWrite).toBe(true)
    expect(JSON.stringify(ruleNodes)).toContain('dept-name-field')
    await backend.destroySession(result.sessionId)
    console.info(`\n[E2E] ✅ 测试通过：真实的 AI Node Tree Pipeline 创建工作正常。`)
  }, 120000) // 超时 120 秒，因为调用真实大模型可能较慢

  it.skipIf(!runRealAI)('验证：真实 LLM ↔ Agent 自主决策目标态链路（full-flow）', async () => {
    console.info(`[E2E-Full] 1. 登录 tenant=${AUTH_TENANT_ID} user=${AUTH_USERNAME}...`)
    await login()
    console.info('[E2E-Full] 🔑 已获取 Token')

    configureSessionBackend({
      getHeaders: () => ({
        Authorization: `Bearer ${authToken}`,
        'X-Tenant-Id': AUTH_TENANT_ID,
      }),
      onSseEvent: (e) => {
        if (e.type === 'tool_calls') {
          console.info(`   [LLM 动作发出] ${e.data}`)
        } else if (e.type === 'message') {
          console.info(`   [LLM 推理] ${e.data}`)
        }
      },
    })

    registerEditStills()
    const session = createSession()

    const seededBootstrap = executeStill('edit.bootstrap', {
      ruleJson: [
        {
          id: 'root-table',
          type: 'r-table',
          props: { dataKey: 'Departments@default' },
          children: [],
        },
      ],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }, session, 'seed-bootstrap-fullflow')
    expect(seededBootstrap.ok).toBe(true)

    const seededCreateTable = executeStill('datasetTool.createTable', {
      tableName: 'Departments',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'count', type: 'number' },
      ],
      resourceType: 'static-data',
      businessCategory: 'master',
    }, session, 'seed-create-table-fullflow')
    expect(seededCreateTable.ok).toBe(true)

    const seededDatasetExport = executeStill('dataset.export', {}, session, 'seed-dataset-export-fullflow')
    expect(seededDatasetExport.ok).toBe(true)

    const backend = new SessionBackendImpl(`${BASE_URL}/api/ai/sessions`)

    const prompt = `当前会话已经完成 edit.bootstrap 且已执行 dataset.export，数据阶段已完成。
  任务目标（最终状态约束）：
  - root-table.props.border = true；
  - root-table 子节点最终仅保留一个 r-text 节点：id=dept-name-b，label=部门名称B-替换；

  ${AUTONOMOUS_GUARDRAILS}

  不要按固定脚本执行；你自主决策动作组合、顺序与参数细节。
  仅在关键写动作后进行一次统一目标态校验；未达成则继续行动，达成后再结束并回复。
  完成后仅回复：full-flow 完成。`

    console.info('[E2E-Full] 2. 启动 LLM Stills 循环调度...')

    const result = await runStillsLoop(prompt, session, backend, {
      maxRounds: 14,
      slidingWindow: 40,
      systemPrompt: AUTONOMOUS_SYSTEM_PROMPT,
    })

    console.info(`\n[E2E-Full] 3. 循环结束. rounds=${result.rounds} aborted=${result.aborted}`)
    const lastAiTurn = [...result.turns].reverse().find((turn) => typeof turn.aiText === 'string' && turn.aiText.length > 0)
    console.info(`[E2E-Full] AI 最终回复：${lastAiTurn?.aiText ?? ''}`)

    const state = getEditState(session)
    const ruleNodes = state.nodeTree?.toJSON()?.children ?? []
    const conversation = await backend.getConversation(result.sessionId)
    const conversationReadable = toReadableConversation(conversation)

    mkdirSync('data', { recursive: true })
    const commLog = {
      generatedAt: new Date().toISOString(),
      scenario: 'full-flow',
      backendBaseUrl: BASE_URL,
      sessionId: result.sessionId,
      prompt,
      seededState: {
        bootstrapOk: seededBootstrap.ok,
        createTableOk: seededCreateTable.ok,
        datasetExportOk: seededDatasetExport.ok,
      },
      rounds: result.rounds,
      aborted: result.aborted,
      abortReason: result.abortReason,
      turns: result.turns,
      executedActions: result.turns
        .map((turn) => turn.toolBlock?.action)
        .filter((action): action is string => typeof action === 'string'),
      backendConversation: conversation,
      backendConversationReadable: conversationReadable,
      ruleNodes,
    }

    const commLogPath = 'data/ai-edit-sparknode-comm-log.fullflow.json'
    const readableLogPath = 'data/ai-edit-sparknode-comm-log.fullflow.readable.json'
    writeFileSync(readableLogPath, JSON.stringify(commLog, null, 2), 'utf-8')
    writeFileSync(commLogPath, JSON.stringify(commLog, null, 2), 'utf-8')
    writeFileSync(DEFAULT_READABLE_COMM_LOG_PATH, JSON.stringify(commLog, null, 2), 'utf-8')
    writeFileSync(DEFAULT_COMM_LOG_PATH, JSON.stringify(commLog, null, 2), 'utf-8')

    console.info('[E2E-Full] 4. 本地树状态检验：')
    console.info(JSON.stringify(ruleNodes, null, 2))
    console.info(`[E2E-Full] 5. 完整通讯日志已写入：${commLogPath}`)
    console.info(`[E2E-Full] 6. 可读通讯日志已写入：${readableLogPath}`)
    console.info(`[E2E-Full] 7. 默认可读通讯日志已更新：${DEFAULT_READABLE_COMM_LOG_PATH}`)
    console.info(`[E2E-Full] 8. 默认通讯日志已更新：${DEFAULT_COMM_LOG_PATH}`)

    const executedActions = result.turns
      .map((turn) => turn.toolBlock?.action)
      .filter((action): action is string => typeof action === 'string')

    const usedCatalogQuery = executedActions.some((action) => action === 'catalog.query' || action === 'stills.actionSpec')
    const usedAddAction = executedActions.some((action) => action === 'sparkNodeTree.addNode' || action === 'sparkNodeTree.addNodes')
    const usedReplaceAction = executedActions.some((action) => action === 'sparkNodeTree.replaceNode' || action === 'sparkNodeTree.replaceNodes')
    const usedSetPropsAction = executedActions.some((action) => action === 'sparkNodeTree.setProps' || action === 'sparkNodeTree.setPropsBatch')
    const usedRemoveAction = executedActions.some((action) => action === 'sparkNodeTree.removeNode' || action === 'sparkNodeTree.removeNodes')
    const hasStillsExecution = result.turns.some((turn) => turn.phase === 'stills-execute' && turn.stillsResult !== undefined)

    const root = Array.isArray(ruleNodes) ? ruleNodes.find((node) => {
      if (typeof node !== 'object' || node === null) return false
      const props = (node as unknown as Record<string, unknown>)['props']
      if (typeof props !== 'object' || props === null) return false
      return (props as Record<string, unknown>)['id'] === 'root-table'
    }) : undefined

    const rootProps = (root !== undefined && typeof root === 'object' && root !== null)
      ? ((root as unknown as Record<string, unknown>)['props'] as Record<string, unknown> | undefined)
      : undefined

    const rootChildren = (root !== undefined && typeof root === 'object' && root !== null)
      ? ((root as unknown as Record<string, unknown>)['children'] as unknown[] | undefined)
      : undefined

    const nestedTableProps = (rootProps?.['tableProps'] as Record<string, unknown> | undefined)
    const rootHasBorder = rootProps?.['border'] === true || nestedTableProps?.['border'] === true

    const containsNodeA = JSON.stringify(ruleNodes).includes('dept-name-a')
    const containsNodeB = JSON.stringify(ruleNodes).includes('dept-name-b')
    const containsReplacedLabel = JSON.stringify(ruleNodes).includes('部门名称B-替换')

    console.info(`[E2E-Full] 动作覆盖统计 add=${usedAddAction} replace=${usedReplaceAction} props=${usedSetPropsAction} remove=${usedRemoveAction}`)

    expect(usedCatalogQuery).toBe(true)
    expect(hasStillsExecution).toBe(true)
    expect(result.aborted).toBe(false)
    expect(Array.isArray(ruleNodes)).toBe(true)
    expect(rootHasBorder).toBe(true)
    expect(Array.isArray(rootChildren)).toBe(true)
    expect(containsNodeA).toBe(false)
    expect(containsNodeB).toBe(true)
    expect(containsReplacedLabel).toBe(true)

    await backend.destroySession(result.sessionId)
    console.info('\n[E2E-Full] ✅ 测试通过：自主决策目标态链路工作正常。')
  }, 120000) // 超时 120 秒，因为调用真实大模型可能较慢
})
