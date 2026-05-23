#!/usr/bin/env node
/**
 * Smoke test: drive the pageDesign module-semantic tool loop to create an
 * employee leave application form.
 *
 * Default mode calls the Java backend SSE endpoint. The backend owns the real
 * LLM provider config, while this script executes pageDesign tools locally.
 *
 * Direct OpenAI/Anthropic-compatible providers remain available for transport
 * debugging via --provider=openai or --provider=anthropic.
 *
 * Use --mock to validate the pageDesign tool chain without making an LLM call:
 *   node --import tsx scripts/verify-page-design-form-llm-smoke.mjs --mock
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  AiHostFetchTransport,
  AiHostToolLoopRunner,
  startRegistrationSession,
  toAiHostRuntimeScope,
} from '@spark-view/spark-ai/host'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessRegistration,
} from '@spark-view/spark-page-config/ai'
import { SparkNodeTree } from '@spark-view/spark-page-config/node-tree'
import { DataSetCrudTool } from '@spark-view/spark-data'

const FORM_PAGE_ID = 'employee-leave-form-smoke'
const FORM_SESSION_ID = `${PAGE_DESIGN_MODULE_ID}:${FORM_PAGE_ID}:${randomUUID()}`
const ROOT_PATH = `/pageDesign[${FORM_PAGE_ID}]`
const LIFECYCLE_PATH = `${ROOT_PATH}/lifecycle[${FORM_PAGE_ID}]`
const DATASET_PATH = `${ROOT_PATH}/dataset[${FORM_PAGE_ID}]`
const NODE_TREE_PATH = `${ROOT_PATH}/node-tree[${FORM_PAGE_ID}]`
const PAYLOAD_PATH = `${ROOT_PATH}/payload-catalog[${FORM_PAGE_ID}]`

function parseArgs(argv) {
  const out = {
    mock: false,
    maxRounds: 14,
    repairAttempts: 4,
    provider: 'java-sse',
    toolChoice: 'auto',
  }
  for (const arg of argv) {
    if (arg === '--mock') out.mock = true
    if (arg.startsWith('--max-rounds=')) out.maxRounds = Number(arg.slice('--max-rounds='.length))
    if (arg.startsWith('--repair-attempts=')) out.repairAttempts = Number(arg.slice('--repair-attempts='.length))
    if (arg.startsWith('--provider=')) out.provider = arg.slice('--provider='.length)
    if (arg.startsWith('--tool-choice=')) out.toolChoice = arg.slice('--tool-choice='.length)
  }
  return out
}

function parseEnvText(text) {
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function loadEnv(rootDir) {
  const env = {}
  for (const file of [
    resolve(rootDir, '.env.java'),
    resolve(rootDir, 'spark-ai-server', '.env.java'),
  ]) {
    if (existsSync(file)) Object.assign(env, parseEnvText(readFileSync(file, 'utf8')))
  }
  Object.assign(env, loadWindowsUserEnv([
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'CLAUDE_CODE_SUBAGENT_MODEL',
    'CLAUDE_CODE_EFFORT_LEVEL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
  ]))
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  return env
}

function normalizeBackendUrl(value) {
  return (value ?? 'http://localhost:8080').replace(/\/+$/, '')
}

function normalizeAiBackendBaseUrl(value) {
  const raw = (value ?? '').replace(/\/+$/, '')
  if (raw.endsWith('/api/ai')) return raw
  if (raw.endsWith('/api')) return `${raw}/ai`
  return `${normalizeBackendUrl(raw || undefined)}/api/ai`
}

function loadWindowsUserEnv(names) {
  if (process.platform !== 'win32') return {}
  const quotedNames = names.map(name => `'${name.replace(/'/g, "''")}'`).join(', ')
  const script = [
    `$names = @(${quotedNames})`,
    '$result = @{}',
    'foreach ($name in $names) {',
    '  $value = [Environment]::GetEnvironmentVariable($name, "User")',
    '  if ($null -ne $value -and $value -ne "") { $result[$name] = $value }',
    '}',
    '$result | ConvertTo-Json -Compress',
  ].join('; ')
  const output = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (output.status !== 0 || output.stdout.trim().length === 0) return {}
  try {
    return JSON.parse(output.stdout)
  } catch {
    return {}
  }
}

function createHost() {
  let script = 'export default {}'
  let style = ''
  let nodeChanged = 0
  let dataChanged = 0
  const nodeTree = SparkNodeTree.fromJson({ type: 'page', props: {}, children: [] })
  const dataSetTool = new DataSetCrudTool('employee-leave-form-smoke')
  return {
    nodeTree,
    dataSetTool,
    host: {
      getNodeTree: () => nodeTree,
      onNodeTreeChanged: () => { nodeChanged += 1 },
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => { dataChanged += 1 },
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
    },
    textModels: () => ({ script, style, nodeChanged, dataChanged }),
  }
}

function runtimeContext() {
  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: FORM_PAGE_ID,
    instanceId: `${PAGE_DESIGN_MODULE_ID}:${FORM_PAGE_ID}`,
  }
}

function businessScope() {
  return {
    businessRegistrationId: PAGE_DESIGN_MODULE_ID,
    businessInstanceId: FORM_PAGE_ID,
    instanceId: FORM_SESSION_ID,
    runtimeInstanceId: FORM_SESSION_ID,
  }
}

function turnMeta(seq = 1) {
  const now = new Date().toISOString()
  return {
    turnId: `turn-employee-leave-form-smoke-${seq}`,
    seq,
    baseRevision: 0,
    queuedAt: now,
    startedAt: now,
    maxParallelTurns: 1,
  }
}

function buildUserPrompt(previousChecks) {
  const createTableArgs = {
    tableName: 'EmployeeLeaveRequest',
    columns: employeeLeaveColumns(),
    resourceType: 'static-data',
    resourceId: 'employee.leave.request',
    businessCategory: 'transaction',
    views: {
      default: {
        rows: [{
          id: 'leave-draft-1',
          employeeName: '',
          employeeNo: '',
          department: '',
          leaveType: 'annual',
          startDate: '',
          endDate: '',
          totalDays: 1,
          reason: '',
          approver: '',
          status: 'draft',
        }],
      },
    },
  }
  const addNodeArgs = {
    parentComponentId: null,
    node: employeeLeaveFormNode(),
  }
  const base = [
    '用真实 pageDesign 工具直接创建一个员工请假申请表单页面。',
    '必须修改 pagedata.json 和 rule.json，不要只输出方案。',
    `当前 pageDesign 实例路径已确认：${ROOT_PATH}`,
    `只能使用这些子模块路径：lifecycle=${LIFECYCLE_PATH}，payload-catalog=${PAYLOAD_PATH}，dataset=${DATASET_PATH}，node-tree=${NODE_TREE_PATH}。`,
    '不要省略方括号实例段，例如不要写 /pageDesign[employee-leave-form-smoke]/dataset。',
    '每次回复最多发起一个 tool_call；收到工具结果后再继续下一个。严禁发起空参数工具调用，尤其禁止 invokeAction 参数为 {}。',
    '严格按这个顺序执行，禁止做额外探索：describeProgress -> describeDesignFlow -> guidePayload x6 -> createTable -> addNode -> 最终一句话。',
    '不要调用 export、getAllData、readScript、readStyle、listTables、countNodes、listChildren、findInstance。',
    '必须创建表 EmployeeLeaveRequest，字段名必须完全使用 camelCase：id、employeeName、employeeNo、department、leaveType、startDate、endDate、totalDays、reason、approver、status。',
    '不要创建 leave_requests、employee_name、leave_type 这类 snake_case 表或字段。',
    'rule.json 必须有 r-form，dataViewKey 必须是 EmployeeLeaveRequest@default，字段组件放在表单 children 中并用 field 绑定上面的 camelCase 字段。',
    '构造任何组件节点前必须直接调用 payload-catalog 的 guidePayload，key 依次为 r-form、r-text、r-select、r-date、r-number、r-textarea。',
    `createTable 的 args 必须完全按这个目标规格组织：${JSON.stringify(createTableArgs)}`,
    `addNode 的 args 必须完全按这个目标规格组织：${JSON.stringify(addNodeArgs)}`,
    '完成后用一句话总结你实际改了哪些文件。',
  ]

  if (previousChecks === undefined) return base.join('\n')

  return [
    '上一轮没有通过 smoke 校验。不要重新解释，继续调用工具修正当前页面。',
    `当前校验失败项：${JSON.stringify(previousChecks)}`,
    '必须补齐缺失项：EmployeeLeaveRequest 表、10 个字段绑定、r-form 节点、标准 dataViewKey、每类组件 guidePayload、createTable 和 addNode。',
    ...base,
  ].join('\n')
}

function buildSystemPrompt() {
  return [
    '这是一次 pageDesign 表单生成 smoke。目标是验证 AI 能否通过 ModuleKind 子模块寻址完成最小表单生成。',
    '路径是宿主传入的确定上下文，不需要重新猜测。若工具返回 schema 或参数指南，必须按返回的 schema 组织参数。',
    '每次只调用一个工具；所有工具调用必须携带完整 JSON 参数，禁止空对象 {}，禁止缺少 path/actionName/args 的 invokeAction。',
    '优先创建最小可运行表单；字段、DataViewKey、组件 props 必须来自工具结果，不要猜测。',
  ].join('\n')
}

function toOpenAiMessage(message) {
  const out = {
    role: message.role,
    content: message.content,
  }
  if (message.tool_call_id !== undefined) out.tool_call_id = message.tool_call_id
  if (message.tool_calls !== undefined) out.tool_calls = message.tool_calls
  return out
}

function sameTransportMessage(left, right) {
  return left.role === right.role
    && left.content === right.content
    && left.tool_call_id === right.tool_call_id
    && JSON.stringify(left.tool_calls ?? null) === JSON.stringify(right.tool_calls ?? null)
}

function mergeSessionMessages(history, messages) {
  const merged = [...history]
  for (const message of messages) {
    const last = merged.at(-1)
    if (last !== undefined && sameTransportMessage(last, message)) continue
    merged.push(message)
  }
  return merged
}

function toAnthropicTools(tools) {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }))
}

function toAnthropicMessages(messages, assistantContentByToolCallId) {
  const out = []
  let pendingToolResults = []
  const flushToolResults = () => {
    if (pendingToolResults.length === 0) return
    out.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: message.tool_call_id ?? 'tool-call',
        content: message.content,
      })
      continue
    }

    flushToolResults()
    if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const restoredContent = message.tool_calls
        .map(call => call.id === undefined ? undefined : assistantContentByToolCallId.get(call.id))
        .find(content => Array.isArray(content))
      if (restoredContent !== undefined) {
        out.push({ role: 'assistant', content: restoredContent })
        continue
      }

      const content = []
      if (message.content.trim().length > 0) content.push({ type: 'text', text: message.content })
      for (const call of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: call.id ?? randomUUID(),
          name: call.function?.name ?? '',
          input: parseToolArguments(call.function?.arguments),
        })
      }
      out.push({ role: 'assistant', content })
      continue
    }

    out.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })
  }

  flushToolResults()
  return out
}

function parseToolArguments(args) {
  if (typeof args !== 'string' || args.trim().length === 0) return {}
  try {
    return JSON.parse(args)
  } catch {
    return {}
  }
}

class OpenAiCompatibleTransport {
  constructor(options) {
    this.options = options
    this.messagesBySessionId = new Map()
  }

  async streamTurn(input) {
    const history = mergeSessionMessages(
      this.messagesBySessionId.get(input.sessionId) ?? [],
      input.messages,
    )
    const response = await fetch(`${this.options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          ...history.map(toOpenAiMessage),
        ],
        tools: input.tools,
        tool_choice: this.options.toolChoice ?? 'auto',
        temperature: 0.1,
        max_tokens: 2200,
      }),
      signal: input.signal,
    })
    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`)
    }
    const payload = await response.json()
    const message = payload?.choices?.[0]?.message ?? {}
    const text = typeof message.content === 'string' ? message.content : ''
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    this.messagesBySessionId.set(input.sessionId, [
      ...history,
      {
        role: 'assistant',
        content: text,
        ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
      },
    ])
    if (text.length > 0) input.onDelta?.(text)
    if (payload?.usage !== undefined) input.onUsage?.(payload.usage)
    return {
      text,
      toolCalls,
    }
  }

  appendMessages(input) {
    this.messagesBySessionId.set(input.sessionId, mergeSessionMessages(
      this.messagesBySessionId.get(input.sessionId) ?? [],
      input.messages,
    ))
    return Promise.resolve()
  }
}

class AnthropicCompatibleTransport {
  constructor(options) {
    this.options = options
    this.assistantContentByToolCallId = new Map()
    this.messagesBySessionId = new Map()
  }

  async streamTurn(input) {
    const history = mergeSessionMessages(
      this.messagesBySessionId.get(input.sessionId) ?? [],
      input.messages,
    )
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    }
    if (this.options.authToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.options.authToken}`
    } else {
      headers['x-api-key'] = this.options.apiKey
    }

    const body = {
      model: this.options.model,
      system: input.systemPrompt,
      messages: toAnthropicMessages(history, this.assistantContentByToolCallId),
      tools: toAnthropicTools(input.tools),
      temperature: 0.1,
      max_tokens: 2200,
    }
    const effort = normalizeDeepSeekEffort(this.options.effort)
    if (this.options.baseUrl.includes('deepseek')) {
      body.thinking = { type: 'enabled' }
      if (effort !== undefined) body.output_config = { effort }
    }
    if (this.options.toolChoice === 'required') {
      body.tool_choice = { type: 'any' }
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: input.signal,
    })
    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`)
    }
    const payload = await response.json()
    const textParts = []
    const toolCalls = []
    const content = Array.isArray(payload.content) ? payload.content : []
    for (const part of content) {
      if (part?.type === 'text' && typeof part.text === 'string') {
        textParts.push(part.text)
      }
      if (part?.type === 'tool_use' && typeof part.name === 'string') {
        toolCalls.push({
          id: typeof part.id === 'string' ? part.id : undefined,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input ?? {}),
          },
        })
      }
    }
    for (const call of toolCalls) {
      if (call.id !== undefined) this.assistantContentByToolCallId.set(call.id, cloneJson(content))
    }
    const text = textParts.join('')
    this.messagesBySessionId.set(input.sessionId, [
      ...history,
      {
        role: 'assistant',
        content: text,
        ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
      },
    ])
    if (text.length > 0) input.onDelta?.(text)
    if (payload?.usage !== undefined) input.onUsage?.(payload.usage)
    return { text, toolCalls }
  }

  appendMessages(input) {
    this.messagesBySessionId.set(input.sessionId, mergeSessionMessages(
      this.messagesBySessionId.get(input.sessionId) ?? [],
      input.messages,
    ))
    return Promise.resolve()
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeDeepSeekEffort(effort) {
  const value = typeof effort === 'string' ? effort.toLowerCase() : ''
  if (value === 'max' || value === 'xhigh') return 'max'
  if (value === 'high' || value === 'medium' || value === 'low') return 'high'
  return undefined
}

function selectLlmConfig(env, requestedProvider) {
  const providerAliases = {
    auto: 'java-sse',
    backend: 'java-sse',
    sse: 'java-sse',
    java: 'java-sse',
    claude: 'anthropic',
  }
  const provider = providerAliases[requestedProvider] ?? requestedProvider
  if (provider === 'java-sse') {
    const backendUrl = normalizeBackendUrl(env.AI_BACKEND_URL)
    return {
      provider: 'java-sse',
      backendUrl,
      baseUrl: normalizeAiBackendBaseUrl(env.AI_HOST_BASE_URL ?? env.AI_BACKEND_URL),
      tenantId: env.AI_TENANT_ID ?? 'lmspark',
      projectId: env.AI_PROJECT_ID ?? '',
      username: env.AI_USERNAME ?? 'admin',
      password: env.AI_PASSWORD ?? 'admin123',
      authToken: env.AI_AUTH_TOKEN ?? '',
    }
  }

  const anthropicAuthToken = env.ANTHROPIC_AUTH_TOKEN ?? ''
  const anthropicApiKey = env.ANTHROPIC_API_KEY ?? ''
  const anthropicBaseUrl = env.ANTHROPIC_BASE_URL ?? ''
  const anthropicModel =
    env.ANTHROPIC_MODEL
    ?? env.CLAUDE_CODE_SUBAGENT_MODEL
    ?? env.ANTHROPIC_DEFAULT_SONNET_MODEL
    ?? ''

  if (provider === 'anthropic' || (
    provider === 'auto'
    && anthropicBaseUrl.trim().length > 0
    && anthropicModel.trim().length > 0
    && (anthropicAuthToken.trim().length > 0 || anthropicApiKey.trim().length > 0)
  )) {
    return {
      provider: 'anthropic',
      baseUrl: anthropicBaseUrl,
      model: anthropicModel,
      authToken: anthropicAuthToken,
      apiKey: anthropicApiKey,
      effort: env.CLAUDE_CODE_EFFORT_LEVEL,
    }
  }

  if (provider !== 'auto' && provider !== 'openai') {
    throw new Error(`Unknown provider: ${requestedProvider}. Use java-sse, auto, anthropic, claude, openai, or --mock.`)
  }

  return {
    provider: 'openai',
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com',
    model: env.AI_MODEL ?? env.OPENAI_MODEL ?? 'gpt-4o-mini',
    apiKey: env.OPENAI_API_KEY ?? '',
  }
}

async function createRealTransport(config) {
  if (config.provider === 'java-sse') {
    return createJavaSseTransport(config)
  }
  if (config.provider === 'anthropic') {
    if (config.baseUrl.trim().length === 0) throw new Error('ANTHROPIC_BASE_URL is missing.')
    if (config.model.trim().length === 0) throw new Error('ANTHROPIC_MODEL is missing.')
    if (config.authToken.trim().length === 0 && config.apiKey.trim().length === 0) {
      throw new Error('ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is missing.')
    }
    return new AnthropicCompatibleTransport(config)
  }

  if (config.apiKey.trim().length === 0) {
    throw new Error('OPENAI_API_KEY is missing. Set it in process env or .env.java.')
  }
  return new OpenAiCompatibleTransport(config)
}

async function createJavaSseTransport(config) {
  const auth = await resolveJavaBackendAuth(config)
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'X-Tenant-Id': config.tenantId,
    Accept: 'text/event-stream',
    ...(auth.projectId.trim().length === 0 ? {} : { 'X-Project-Id': auth.projectId }),
  }
  return new AiHostFetchTransport({
    baseUrl: config.baseUrl,
    getHeaders: () => headers,
  })
}

async function resolveJavaBackendAuth(config) {
  if (config.authToken.trim().length > 0) {
    return {
      token: config.authToken,
      projectId: config.projectId,
    }
  }
  const response = await fetch(`${config.backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': config.tenantId,
      ...(config.projectId.trim().length === 0 ? {} : { 'X-Project-Id': config.projectId }),
    },
    body: JSON.stringify({
      tenantId: config.tenantId,
      username: config.username,
      password: config.password,
    }),
  })
  if (!response.ok) {
    throw new Error(`Java backend login failed: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json()
  const token = typeof payload?.token === 'string'
    ? payload.token
    : (typeof payload?.data?.token === 'string' ? payload.data.token : '')
  if (token.trim().length === 0) {
    throw new Error('Java backend login failed: missing token')
  }
  const loginDefaultProjectId = typeof payload?.defaultProjectId === 'string'
    ? payload.defaultProjectId
    : (typeof payload?.data?.defaultProjectId === 'string' ? payload.data.defaultProjectId : '')
  return {
    token,
    projectId: config.projectId.trim().length === 0 ? loginDefaultProjectId : config.projectId,
  }
}

function toolCall(id, name, args) {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}

function employeeLeaveColumns() {
  return [
    { name: 'id', type: 'string', isPrimaryKey: true, required: true },
    { name: 'employeeName', type: 'string', required: true },
    { name: 'employeeNo', type: 'string', required: true },
    { name: 'department', type: 'string', required: true },
    { name: 'leaveType', type: 'string', required: true },
    { name: 'startDate', type: 'string', required: true },
    { name: 'endDate', type: 'string', required: true },
    { name: 'totalDays', type: 'number', required: true },
    { name: 'reason', type: 'string', required: true },
    { name: 'approver', type: 'string' },
    { name: 'status', type: 'string' },
  ]
}

function employeeLeaveFormNode() {
  return {
    type: 'r-form',
    id: 'employee-leave-form',
    props: {
      dataViewKey: 'EmployeeLeaveRequest@default',
      contextDataMember: 'currentRow',
      autoColumns: false,
      labelWidth: '120px',
      gridColumns: 24,
      gridGap: 12,
    },
    children: [
      { type: 'r-text', id: 'leave-employee-name', props: { field: 'employeeName', label: '员工姓名' } },
      { type: 'r-text', id: 'leave-employee-no', props: { field: 'employeeNo', label: '员工编号' } },
      {
        type: 'r-select',
        id: 'leave-department',
        props: {
          field: 'department',
          label: '部门',
          options: [
            { label: '研发部', value: 'rd' },
            { label: '产品部', value: 'product' },
            { label: '运营部', value: 'ops' },
          ],
          optionLabelField: 'label',
          optionValueField: 'value',
        },
      },
      {
        type: 'r-select',
        id: 'leave-type',
        props: {
          field: 'leaveType',
          label: '请假类型',
          options: [
            { label: '年假', value: 'annual' },
            { label: '病假', value: 'sick' },
            { label: '事假', value: 'personal' },
            { label: '其他', value: 'other' },
          ],
          optionLabelField: 'label',
          optionValueField: 'value',
        },
      },
      { type: 'r-date', id: 'leave-start-date', props: { field: 'startDate', label: '开始日期' } },
      { type: 'r-date', id: 'leave-end-date', props: { field: 'endDate', label: '结束日期' } },
      { type: 'r-number', id: 'leave-total-days', props: { field: 'totalDays', label: '请假天数' } },
      { type: 'r-textarea', id: 'leave-reason', props: { field: 'reason', label: '请假原因' } },
      { type: 'r-text', id: 'leave-approver', props: { field: 'approver', label: '审批人' } },
      {
        type: 'r-select',
        id: 'leave-status',
        props: {
          field: 'status',
          label: '状态',
          options: [
            { label: '草稿', value: 'draft' },
            { label: '审批中', value: 'pending' },
            { label: '已通过', value: 'approved' },
            { label: '已驳回', value: 'rejected' },
          ],
          optionLabelField: 'label',
          optionValueField: 'value',
        },
      },
    ],
  }
}

function mockCallPlan() {
  return [
    toolCall('mock-1', 'listChildren', { path: '/' }),
    toolCall('mock-2', 'findInstance', { path: '/', childKind: PAGE_DESIGN_MODULE_ID, query: {} }),
    toolCall('mock-3', 'invokeAction', { path: LIFECYCLE_PATH, actionName: 'describeProgress', args: {} }),
    toolCall('mock-4', 'invokeAction', { path: LIFECYCLE_PATH, actionName: 'describeDesignFlow', args: { phase: '数据规划' } }),
    toolCall('mock-5', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'queryPayloads', args: { category: 'container', keyword: 'form', limit: 10 } }),
    toolCall('mock-6', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'guidePayload', args: { key: 'r-form' } }),
    toolCall('mock-7', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'guidePayload', args: { key: 'r-text' } }),
    toolCall('mock-8', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'guidePayload', args: { key: 'r-select' } }),
    toolCall('mock-9', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'guidePayload', args: { key: 'r-date' } }),
    toolCall('mock-10', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'guidePayload', args: { key: 'r-number' } }),
    toolCall('mock-11', 'invokeAction', { path: PAYLOAD_PATH, actionName: 'guidePayload', args: { key: 'r-textarea' } }),
    toolCall('mock-12', 'invokeAction', {
      path: DATASET_PATH,
      actionName: 'createTable',
      args: {
        tableName: 'EmployeeLeaveRequest',
        columns: employeeLeaveColumns(),
        resourceType: 'static-data',
        resourceId: 'employee.leave.request',
        businessCategory: 'transaction',
        views: {
          default: {
            rows: [{
              id: 'leave-draft-1',
              employeeName: '',
              employeeNo: '',
              department: '',
              leaveType: 'annual',
              startDate: '',
              endDate: '',
              totalDays: 1,
              reason: '',
              approver: '',
              status: 'draft',
            }],
          },
        },
      },
    }),
    toolCall('mock-13', 'invokeAction', {
      path: NODE_TREE_PATH,
      actionName: 'addNode',
      args: {
        parentComponentId: null,
        node: employeeLeaveFormNode(),
      },
    }),
  ]
}

class MockPageDesignTransport {
  constructor() {
    this.index = 0
    this.calls = mockCallPlan()
  }

  streamTurn() {
    if (this.index >= this.calls.length) {
      return Promise.resolve({
        text: '已创建员工请假申请表单页面，包含 EmployeeLeaveRequest 数据表和 r-form 字段绑定。',
        toolCalls: [],
      })
    }
    const call = this.calls[this.index]
    this.index += 1
    return Promise.resolve({
      text: '',
      toolCalls: [call],
    })
  }

  appendMessages() {
    return Promise.resolve()
  }
}

function flattenNodes(node) {
  const children = Array.isArray(node.children) ? node.children : []
  return [node, ...children.flatMap(flattenNodes)]
}

function readActionName(record) {
  const args = record.args
  return args && typeof args === 'object' && typeof args.actionName === 'string' ? args.actionName : null
}

function readPath(record) {
  const args = record.args
  return args && typeof args === 'object' && typeof args.path === 'string' ? args.path : null
}

function validateArtifacts(nodeTree, dataSetTool, toolCalls) {
  const rule = nodeTree.toJSON()
  const nodes = flattenNodes(rule)
  const formNodes = nodes.filter(node => node.type === 'r-form')
  const fieldNodes = nodes.filter(node => node.props && typeof node.props.field === 'string')
  const pagedata = dataSetTool.toJson()
  const tables = pagedata.tables ?? {}
  const tableNames = Object.keys(tables)
  const dataViewKeys = nodes
    .map(node => node.props && typeof node.props.dataViewKey === 'string' ? node.props.dataViewKey : null)
    .filter(Boolean)
  const schemaFields = new Set(employeeLeaveColumns().map(column => column.name))
  const boundFields = fieldNodes.map(node => node.props.field)
  const missingBindings = [...schemaFields].filter(field => field !== 'id' && !boundFields.includes(field))
  const invalidDataViewKeys = dataViewKeys.filter(key =>
    !(/^[^@]+@[^@]+$/.test(key) || /^#[^@]+@[^@]+@[^@]+$/.test(key)),
  )
  const failedToolCalls = toolCalls.filter(call => call.ok !== true)
  const actionNames = toolCalls
    .map(call => call.actionName)
    .filter(actionName => typeof actionName === 'string')
  const forbiddenActionNames = actionNames.filter(actionName => [
    'export',
    'getAllData',
    'readScript',
    'readStyle',
    'listTables',
    'countNodes',
  ].includes(actionName))
  return {
    ok:
      tableNames.includes('EmployeeLeaveRequest')
      && formNodes.length > 0
      && fieldNodes.length >= 9
      && missingBindings.length === 0
      && invalidDataViewKeys.length === 0
      && failedToolCalls.length === 0
      && actionNames.includes('createTable')
      && actionNames.includes('addNode')
      && actionNames.filter(actionName => actionName === 'guidePayload').length >= 4,
    rule,
    pagedata,
    checks: {
      tableNames,
      formCount: formNodes.length,
      fieldCount: fieldNodes.length,
      boundFields,
      missingBindings,
      dataViewKeys,
      invalidDataViewKeys,
      failedToolCalls,
      forbiddenActionNames,
      actionNames,
    },
  }
}

async function runSmoke(options) {
  const { host, nodeTree, dataSetTool, textModels } = createHost()
  const registration = createPageDesignBusinessRegistration({
    getEditToolHost: () => host,
  })
  const scope = businessScope()
  await startRegistrationSession(registration, runtimeContext())
  const boot = await registration.runtime.executeTool('invokeAction', {
    path: LIFECYCLE_PATH,
    actionName: 'bootstrap',
    args: {},
  }, toAiHostRuntimeScope(scope))
  if (!boot.ok) throw new Error(`pageDesign bootstrap failed: ${boot.msg}`)

  const env = loadEnv(process.cwd())
  const llmConfig = selectLlmConfig(env, options.provider)
  const transportConfig = { ...llmConfig, toolChoice: options.toolChoice }
  const transport = options.mock
    ? new MockPageDesignTransport()
    : await createRealTransport(transportConfig)

  const fcCalls = []
  const deltas = []
  const usages = []
  const runner = new AiHostToolLoopRunner({
    registry: { get: () => registration, list: () => [registration] },
    transport,
    maxToolRounds: options.maxRounds,
  })

  const maxAttempts = options.mock ? 1 : Math.max(1, options.repairAttempts + 1)
  let artifacts = validateArtifacts(nodeTree, dataSetTool, fcCalls)
  let attempts = 0
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt
    const previousChecks = attempt === 1 ? undefined : artifacts.checks
    await runner.runToolLoop({
      registration,
      scope,
      request: {
        historyMsgs: [{
          role: 'user',
          content: buildUserPrompt(previousChecks),
        }],
        systemPrompt: buildSystemPrompt(),
        onDelta: delta => deltas.push(delta),
        onUsage: usage => usages.push(usage),
        onFcCall: record => {
          fcCalls.push({
            ...(record.callId === undefined ? {} : { callId: record.callId }),
            toolName: record.toolName,
            actionName: readActionName(record),
            path: readPath(record),
            status: record.status,
            ok: record.result.ok,
            errorCode: record.result.ok ? null : record.result.code ?? null,
            errorMessage: record.result.ok ? null : record.result.msg ?? null,
            fix: record.result.ok ? null : record.result.fix ?? null,
            ...(record.result.ok ? {} : { args: record.args }),
          })
        },
      },
      turn: turnMeta(attempt),
      clearSelected: () => undefined,
    })

    artifacts = validateArtifacts(nodeTree, dataSetTool, fcCalls)
    if (artifacts.ok) break
    deltas.push(`\n[smoke] 第 ${attempt} 轮未通过，将按校验结果继续修正。\n`)
  }
  return {
    ok: artifacts.ok,
    mode: options.mock ? 'mock' : 'real',
    attempts,
    sessionId: scope.instanceId,
    llm: {
      provider: options.mock ? 'mock' : llmConfig.provider,
      baseUrl: options.mock ? '' : llmConfig.baseUrl,
      model: options.mock ? '' : llmConfig.model ?? '',
      toolChoice: options.mock ? 'mock' : options.toolChoice,
      credential: options.mock ? 'mock' : 'present',
      toolCallCount: fcCalls.length,
      usages,
    },
    toolCalls: fcCalls,
    summaryText: deltas.join('').slice(0, 1200),
    textModels: textModels(),
    validation: artifacts.checks,
    pagedata: artifacts.pagedata,
    rule: artifacts.rule,
  }
}

const options = parseArgs(process.argv.slice(2))
runSmoke(options).then((result) => {
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(2)
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
