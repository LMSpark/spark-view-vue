import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageDesignModule } from '@spark-view/spark-ai'
import type {
  AiRuntimeFunctionCallResult,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeStartSessionResult,
} from '@spark-view/spark-ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config'
import {
  AppAiBusinessRegistry,
  AppAiHost,
  FetchAppAiHostTransport,
  createAppAiToolCodec,
  registerAppAiBusinesses,
  uploadAppAiAttachment,
  type AppAiHostTransport,
} from '@/services/ai-host'
import type {
  AppAiBusinessLifecycleDirective,
  AppAiBusinessRuntime,
  AppAiStreamTurnInput,
} from '@/services/ai-host'

function resolveMaybeGetter<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition was not met')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const NO_PARAMS_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

function collectProviderSchemaIssues(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) return
  if ('kind' in value) issues.push(`${path}.kind`)
  const properties = value['properties']
  if (isRecord(properties)) {
    for (const [key, property] of Object.entries(properties)) {
      if (!isRecord(property) && typeof property !== 'boolean') {
        issues.push(`${path}.properties.${key}`)
        continue
      }
      collectProviderSchemaIssues(property, `${path}.properties.${key}`, issues)
    }
  }
  for (const key of ['items', 'additionalProperties'] as const) {
    const child = value[key]
    if (isRecord(child)) collectProviderSchemaIssues(child, `${path}.${key}`, issues)
  }
  for (const key of ['oneOf', 'anyOf', 'allOf', 'prefixItems'] as const) {
    const children = value[key]
    if (Array.isArray(children)) {
      children.forEach((child, index) => collectProviderSchemaIssues(child, `${path}.${key}[${index}]`, issues))
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AppAiHost', () => {
  it('routes through registered leave-request runtime and switches persistence after selection', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T14:41:46.000Z'))
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      resolveLeaveDraftId: () => 'leave-draft-1',
    })

    const streamedTurns: AppAiStreamTurnInput[] = []
    const transport: AppAiHostTransport = {
      routeBusiness: vi.fn(async () => ({ moduleId: 'manualLeave', confidence: 0.95, reason: 'leave request' })),
      streamTurn: vi.fn(async (input) => {
        streamedTurns.push(input)
        input.onDelta?.('请假已进入草稿')
        return { text: '请假已进入草稿', toolCalls: [] }
      }),
      appendMessages: vi.fn(async () => {}),
    }
    const host = new AppAiHost({ registry, transport })
    const config = host.createPanelConfig()
    const onDelta = vi.fn()
    const onSseEvent = vi.fn()

    expect(resolveMaybeGetter(config.disablePersistence ?? false)).toBe(true)

    await config.sender({
      historyMsgs: [{ role: 'user', content: '我要请假两天' }],
      mode: 'multi',
      onDelta,
      onSseEvent,
    })

    expect(streamedTurns[0]?.scope).toMatchObject({
      businessRegistrationId: 'manualLeave',
      businessInstanceId: 'leave-draft-1',
    })
    expect(streamedTurns[0]?.systemPrompt).toContain('当前 UTC 时间：2026-05-13T14:41:46.000Z')
    expect(streamedTurns[0]?.systemPrompt).toContain('相对日期')
    expect(streamedTurns[0]?.scope.businessInstanceId).toBe('leave-draft-1')
    expect(streamedTurns[0]?.sessionId).toBe('manualLeave:leave-draft-1')
    expect(streamedTurns[0]?.messages).toEqual([{ role: 'user', content: '我要请假两天' }])
    expect(resolveMaybeGetter(config.disablePersistence ?? false)).toBe(false)
    expect(resolveMaybeGetter(config.storageKey)).toBe('spark-ai-session:manualLeave:leave-draft-1')
    expect(onDelta).toHaveBeenCalledWith(expect.stringContaining('人工请假'))
    expect(onDelta).toHaveBeenCalledWith('请假已进入草稿')
    const llmRequest = onSseEvent.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === 'llm-request')
    expect(llmRequest).toMatchObject({
      sessionId: 'manualLeave:leave-draft-1',
      streamKey: expect.stringContaining('manualLeave::leave-draft-1::llm::'),
      scope: expect.objectContaining({
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'leave-draft-1',
        eventModuleId: 'llm',
      }),
    })
    const llmRequestData = JSON.parse(llmRequest?.data ?? '{}') as {
      systemPrompt?: string
      messages?: Array<{ role: string; content: string }>
      tools?: Array<{ function?: { name?: string } }>
    }
    expect(llmRequestData.systemPrompt).toContain('当前 UTC 时间：2026-05-13T14:41:46.000Z')
    expect(llmRequestData.messages).toEqual([{ role: 'user', content: '我要请假两天' }])
    expect(llmRequestData.tools?.some((tool) => tool.function?.name?.includes('describeDraft'))).toBe(true)
  })

  it('registers PageDesign only in the composition root when an edit host is provided', () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      getPageDesignEditHost: () => ({}) as PageDesignEditHost,
    })

    expect(registry.get('manualLeave')).toBeDefined()
    expect(registry.get(PageDesignModule.moduleId)).toBeDefined()
  })

  it('passes function usage rules into LLM tool descriptions', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      resolveLeaveDraftId: () => 'leave-draft-1',
    })
    const runtime = registry.get('manualLeave')
    expect(runtime).toBeDefined()
    const projection = await runtime!.startSession({
      moduleId: 'manualLeave',
      moduleInstanceId: 'leave-draft-1',
      instanceId: 'ai:manualLeave:leave-draft-1',
    })
    const codec = createAppAiToolCodec(projection)
    const setDraftFields = codec.tools.find((tool) => tool.function.name.includes('setDraftFields'))

    expect(setDraftFields?.function.description).toContain('当前日期换算')
    expect(setDraftFields?.function.description).toContain('只有调用 setDraftFields 成功后')
  })

  it('exposes PageDesign parameter schemas as provider-ready JSON Schema', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      getPageDesignEditHost: () => ({}) as PageDesignEditHost,
      resolvePageDesignInstanceId: () => 'data-report',
    })
    const runtime = registry.get(PageDesignModule.moduleId)
    expect(runtime).toBeDefined()
    if (runtime === undefined) return

    const projection = await runtime.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'data-report',
      instanceId: 'pageDesign:data-report',
    })
    const codec = createAppAiToolCodec(projection)
    const issues: string[] = []
    codec.tools.forEach((tool, index) => {
      collectProviderSchemaIssues(tool.function.parameters, `tools[${index}].function.parameters`, issues)
    })
    const writeScript = codec.tools.find((tool) => tool.function.name.includes('writeScript'))
    const writeScriptProperties = writeScript?.function.parameters['properties']

    expect(issues).toEqual([])
    expect(writeScriptProperties).toMatchObject({
      content: {
        type: 'string',
        description: expect.stringContaining('完整文本内容'),
      },
    })
  })

  it('lets leave-request runtime complete and release live draft state after submit', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      resolveLeaveDraftId: () => 'leaveDraft:complete',
    })
    const runtime = registry.get('manualLeave')
    expect(runtime).toBeDefined()
    if (runtime === undefined) return
    const context = {
      moduleId: 'manualLeave',
      moduleInstanceId: 'leaveDraft:complete',
      instanceId: 'ai:manualLeave:leaveDraft:complete',
    }
    const projection = await runtime.startSession(context)
    await runtime.executeFunctionCall({
      ...context,
      action: 'leaveDraft%3Acomplete@manualLeave@setDraftFields',
      args: {
        fields: {
          applicantName: 'Ada',
          leaveType: 'annual',
          startDate: '2026-05-14',
          endDate: '2026-05-15',
          totalDays: 2,
          reason: 'family care',
        },
      },
      projection,
    })
    const submitted = await runtime.executeFunctionCall({
      ...context,
      action: 'leaveDraft%3Acomplete@manualLeave@submitDraft',
      args: {},
      projection,
    })
    const directive = await runtime.afterFunctionCall?.({
      ...context,
      action: 'leaveDraft%3Acomplete@manualLeave@submitDraft',
      args: {},
      result: submitted,
    })

    expect(directive).toMatchObject({
      status: 'complete',
      releaseInstance: true,
    })
    expect(directive?.finalAssistantMessage).toContain('请假申请已提交成功')
    if (directive !== undefined) {
      await runtime.endBusinessInstance?.(context, directive)
    }

    const restartedContext = {
      ...context,
      instanceId: 'ai:manualLeave:leaveDraft:complete:restart',
    }
    const restarted = await runtime.startSession(restartedContext)
    const described = await runtime.executeFunctionCall({
      ...restartedContext,
      action: 'leaveDraft%3Acomplete@manualLeave@describeDraft',
      args: {},
      projection: restarted,
    })
    expect(described).toMatchObject({
      ok: true,
      data: {
        draft: {
          status: 'draft',
          fields: {},
        },
        missingFields: ['applicantName', 'leaveType', 'startDate', 'endDate', 'reason'],
      },
    })
  })

  it('lets frontend business runtime complete the tool loop without backend guard logic', async () => {
    const projection = {
      scope: {
        moduleId: 'taskBiz',
        moduleInstanceId: 'task-1',
        instanceId: 'ai:taskBiz:task-1',
        runtimeInstanceId: 'ai:taskBiz:task-1',
      },
      module: {
        moduleId: 'taskBiz',
        modulePath: 'taskBiz',
        moduleIds: ['taskBiz'],
        name: 'Task Business',
        description: 'Completes a task.',
        functions: [{
          action: 'task-1@taskBiz@finish',
          moduleId: 'taskBiz',
          modulePath: 'taskBiz',
          moduleIds: ['taskBiz'],
          description: 'Finish the task.',
          paramsSchema: NO_PARAMS_SCHEMA,
          contextParams: [],
        }],
        modules: [],
      },
      promptSnapshot: 'Finish tasks.',
      availableFunctions: [{
        action: 'task-1@taskBiz@finish',
        moduleId: 'taskBiz',
        modulePath: 'taskBiz',
        moduleIds: ['taskBiz'],
        description: 'Finish the task.',
        paramsSchema: NO_PARAMS_SCHEMA,
        contextParams: [],
      }],
    } as unknown as AiRuntimeStartSessionResult
    const endBusinessInstance = vi.fn()
    const runtime: AppAiBusinessRuntime = {
      moduleId: 'taskBiz',
      getRegistrationData: () => ({
        moduleId: 'taskBiz',
        name: 'Task Business',
        description: 'Completes a task.',
        functions: [{
          functionId: 'finish',
          description: 'Finish the task.',
          paramsSchema: NO_PARAMS_SCHEMA,
        }],
        modules: [],
      }),
      resolveBusinessInstance: () => 'task-1',
      startSession: vi.fn(async (): Promise<AiRuntimeStartSessionResult> => projection),
      appendMessage: vi.fn((options): AiRuntimeMessageHistoryEntry => ({
        id: 'history-1',
        seq: 1,
        timestamp: 1,
        kind: 'message' as const,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        instanceId: options.instanceId,
        runtimeInstanceId: options.instanceId,
        role: options.role,
        source: options.source ?? 'system',
        content: options.content,
      })),
      executeFunctionCall: vi.fn(async (): Promise<AiRuntimeFunctionCallResult<unknown>> => ({
        ok: true,
        data: { done: true },
        summary: 'done',
      })),
      afterFunctionCall: vi.fn((): AppAiBusinessLifecycleDirective => ({
        status: 'complete',
        reason: 'done',
        finalAssistantMessage: '任务已完成。',
        releaseInstance: true,
      })),
      endBusinessInstance,
      getSessionHistory: () => [],
    }
    const registry = new AppAiBusinessRegistry()
    registry.register(runtime)
    const appendMessages = vi.fn(async () => {})
    const streamTurn = vi.fn(async () => ({
      text: '我来处理。',
      toolCalls: [{
        id: 'call_finish',
        type: 'function',
        function: { name: 'ai_0_taskBiz_finish', arguments: '{}' },
      }],
    }))
    const transport: AppAiHostTransport = {
      routeBusiness: vi.fn(async () => ({ moduleId: 'taskBiz', confidence: 0.95, reason: 'task' })),
      streamTurn,
      appendMessages,
    }
    const host = new AppAiHost({ registry, transport, maxToolRounds: 4 })
    const onDelta = vi.fn()
    const onFcCall = vi.fn()

    await host.createPanelConfig().sender({
      historyMsgs: [{ role: 'user', content: '完成任务' }],
      mode: 'multi',
      turn: {
        turnId: 'turn-tool-loop',
        seq: 7,
        baseRevision: 0,
        queuedAt: '2026-05-14T00:00:00.000Z',
        startedAt: '2026-05-14T00:00:00.000Z',
        maxParallelTurns: 2,
      },
      onDelta,
      onFcCall,
    })

    expect(streamTurn).toHaveBeenCalledTimes(1)
    expect(runtime.executeFunctionCall).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task-1@taskBiz@finish',
    }))
    expect(runtime.afterFunctionCall).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task-1@taskBiz@finish',
      result: expect.objectContaining({ ok: true }),
    }))
    expect(endBusinessInstance).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'taskBiz',
      moduleInstanceId: 'task-1',
    }), expect.objectContaining({
      status: 'complete',
      releaseInstance: true,
    }))
    expect(appendMessages).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', content: '任务已完成。' }),
      ]),
    }))
    expect(onDelta).toHaveBeenCalledWith('任务已完成。')
    expect(onFcCall).toHaveBeenCalledWith(expect.objectContaining({
      turnId: 'turn-tool-loop',
      round: 1,
      toolName: 'task-1@taskBiz@finish',
    }))
  })

  it('passes assistant tool calls and tool results as the next turn messages when business continues', async () => {
    const projection = {
      scope: {
        moduleId: 'taskBiz',
        moduleInstanceId: 'task-1',
        instanceId: 'taskBiz:task-1',
        runtimeInstanceId: 'taskBiz:task-1',
      },
      module: {
        moduleId: 'taskBiz',
        modulePath: 'taskBiz',
        moduleIds: ['taskBiz'],
        name: 'Task Business',
        description: 'Completes a task.',
        functions: [{
          action: 'task-1@taskBiz@check',
          moduleId: 'taskBiz',
          modulePath: 'taskBiz',
          moduleIds: ['taskBiz'],
          description: 'Check the task.',
          paramsSchema: NO_PARAMS_SCHEMA,
          contextParams: [],
        }],
        modules: [],
      },
      promptSnapshot: 'Check tasks.',
      availableFunctions: [{
        action: 'task-1@taskBiz@check',
        moduleId: 'taskBiz',
        modulePath: 'taskBiz',
        moduleIds: ['taskBiz'],
        description: 'Check the task.',
        paramsSchema: NO_PARAMS_SCHEMA,
        contextParams: [],
      }],
    } as unknown as AiRuntimeStartSessionResult
    const runtime: AppAiBusinessRuntime = {
      moduleId: 'taskBiz',
      getRegistrationData: () => ({
        moduleId: 'taskBiz',
        name: 'Task Business',
        description: 'Completes a task.',
        functions: [{ functionId: 'check', description: 'Check the task.', paramsSchema: NO_PARAMS_SCHEMA }],
        modules: [],
      }),
      resolveBusinessInstance: () => 'task-1',
      startSession: vi.fn(async (): Promise<AiRuntimeStartSessionResult> => projection),
      appendMessage: vi.fn((options): AiRuntimeMessageHistoryEntry => ({
        id: 'history-1',
        seq: 1,
        timestamp: 1,
        kind: 'message' as const,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        instanceId: options.instanceId,
        runtimeInstanceId: options.instanceId,
        role: options.role,
        source: options.source ?? 'system',
        content: options.content,
      })),
      executeFunctionCall: vi.fn(async (): Promise<AiRuntimeFunctionCallResult<unknown>> => ({
        ok: true,
        data: { checked: true },
        summary: 'checked',
      })),
      getSessionHistory: () => [],
    }
    const registry = new AppAiBusinessRegistry()
    registry.register(runtime)
    const appendMessages = vi.fn(async () => {})
    const streamInputs: AppAiStreamTurnInput[] = []
    const streamTurn = vi.fn(async (input: AppAiStreamTurnInput) => {
      streamInputs.push(input)
      return streamInputs.length === 1
        ? {
            text: '先检查。',
            toolCalls: [{
              id: 'call_check',
              type: 'function',
              function: { name: 'ai_0_taskBiz_check', arguments: '{}' },
            }],
          }
        : { text: '检查完成。', toolCalls: [] }
    })
    const host = new AppAiHost({
      registry,
      maxToolRounds: 4,
      transport: {
        routeBusiness: vi.fn(async () => ({ moduleId: 'taskBiz', confidence: 0.95, reason: 'task' })),
        streamTurn,
        appendMessages,
      },
    })

    const sseEvents: Array<{ type: string; data: string }> = []
    await host.createPanelConfig().sender({
      historyMsgs: [{ role: 'user', content: '检查任务' }],
      mode: 'multi',
      onSseEvent: (event) => {
        sseEvents.push(event)
      },
    })

    expect(streamTurn).toHaveBeenCalledTimes(2)
    expect(appendMessages).not.toHaveBeenCalled()
    expect(streamInputs[0]?.messages).toEqual([{ role: 'user', content: '检查任务' }])
    expect(streamInputs[1]?.messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '先检查。',
        tool_calls: [expect.objectContaining({ id: 'call_check' })],
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call_check',
        content: expect.stringContaining('"checked":true'),
      }),
    ])
    const llmRequests = sseEvents.filter((event) => event.type === 'llm-request')
    expect(llmRequests).toHaveLength(2)
    const firstRequest = JSON.parse(llmRequests[0]?.data ?? '{}') as {
      systemPrompt?: string
      messages?: unknown
      tools?: Array<{ function?: { name?: string } }>
    }
    const secondRequest = JSON.parse(llmRequests[1]?.data ?? '{}') as {
      messages?: Array<{ role?: string; content?: string; tool_call_id?: string }>
    }
    expect(firstRequest.systemPrompt).toContain('Check tasks.')
    expect(firstRequest.messages).toEqual([{ role: 'user', content: '检查任务' }])
    expect(firstRequest.tools?.[0]?.function?.name).toContain('check')
    expect(secondRequest.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'tool', tool_call_id: 'call_check', content: expect.stringContaining('"checked":true') }),
    ]))
  })

  it('does not cap tool rounds by default', async () => {
    const projection = {
      scope: {
        moduleId: 'loopBiz',
        moduleInstanceId: 'loop-1',
        instanceId: 'loopBiz:loop-1',
        runtimeInstanceId: 'loopBiz:loop-1',
      },
      module: {
        moduleId: 'loopBiz',
        modulePath: 'loopBiz',
        moduleIds: ['loopBiz'],
        name: 'Loop Business',
        description: 'Runs several tool rounds.',
        functions: [{
          action: 'loop-1@loopBiz@step',
          moduleId: 'loopBiz',
          modulePath: 'loopBiz',
          moduleIds: ['loopBiz'],
          description: 'Run one step.',
          paramsSchema: NO_PARAMS_SCHEMA,
          contextParams: [],
        }],
        modules: [],
      },
      promptSnapshot: 'Run steps.',
      availableFunctions: [{
        action: 'loop-1@loopBiz@step',
        moduleId: 'loopBiz',
        modulePath: 'loopBiz',
        moduleIds: ['loopBiz'],
        description: 'Run one step.',
        paramsSchema: NO_PARAMS_SCHEMA,
        contextParams: [],
      }],
    } as unknown as AiRuntimeStartSessionResult
    const runtime: AppAiBusinessRuntime = {
      moduleId: 'loopBiz',
      getRegistrationData: () => ({
        moduleId: 'loopBiz',
        name: 'Loop Business',
        description: 'Runs several tool rounds.',
        functions: [{ functionId: 'step', description: 'Run one step.', paramsSchema: NO_PARAMS_SCHEMA }],
        modules: [],
      }),
      resolveBusinessInstance: () => 'loop-1',
      startSession: vi.fn(async (): Promise<AiRuntimeStartSessionResult> => projection),
      appendMessage: vi.fn((options): AiRuntimeMessageHistoryEntry => ({
        id: 'loop-history-1',
        seq: 1,
        timestamp: 1,
        kind: 'message' as const,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        instanceId: options.instanceId,
        runtimeInstanceId: options.instanceId,
        role: options.role,
        source: options.source ?? 'system',
        content: options.content,
      })),
      executeFunctionCall: vi.fn(async (): Promise<AiRuntimeFunctionCallResult<unknown>> => ({
        ok: true,
        data: { stepped: true },
        summary: 'stepped',
      })),
      getSessionHistory: () => [],
    }
    const registry = new AppAiBusinessRegistry()
    registry.register(runtime)
    const streamTurn = vi.fn(async (_input: AppAiStreamTurnInput) => (
      streamTurn.mock.calls.length <= 5
        ? {
            text: `第 ${streamTurn.mock.calls.length} 步。`,
            toolCalls: [{
              id: `call_step_${streamTurn.mock.calls.length}`,
              type: 'function',
              function: { name: 'ai_0_loopBiz_step', arguments: '{}' },
            }],
          }
        : { text: '完成。', toolCalls: [] }
    ))
    const onDelta = vi.fn()
    const host = new AppAiHost({
      registry,
      transport: {
        routeBusiness: vi.fn(async () => ({ moduleId: 'loopBiz', confidence: 0.95, reason: 'loop' })),
        streamTurn,
        appendMessages: vi.fn(async () => {}),
      },
    })

    await host.createPanelConfig().sender({
      historyMsgs: [{ role: 'user', content: '连续执行多轮' }],
      mode: 'multi',
      onDelta,
    })

    expect(streamTurn).toHaveBeenCalledTimes(6)
    expect(runtime.executeFunctionCall).toHaveBeenCalledTimes(5)
    expect(onDelta).not.toHaveBeenCalledWith('工具调用轮次已达上限，请检查当前业务状态后继续。')
  })

  it('sends auth and tenant headers through the fetch transport', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sessionId: 'manualLeave:draft-1',
      turnId: 'turn-1',
      protocolVersion: 3,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = new FetchAppAiHostTransport('/api/ai', () => ({
      Authorization: 'Bearer token-1',
      'X-Tenant-Id': 'tenant-1',
      'X-Project-Id': 'project-1',
    }))

    await transport.appendMessages({
      sessionId: 'manualLeave:draft-1',
      scope: {
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'draft-1',
        instanceId: 'manualLeave:draft-1',
        runtimeInstanceId: 'manualLeave:draft-1',
      },
      turn: {
        turnId: 'turn-1',
        seq: 1,
        baseRevision: 0,
        queuedAt: '2026-05-13T00:00:00.000Z',
        startedAt: '2026-05-13T00:00:00.000Z',
        maxParallelTurns: 1,
      },
      messages: [{ role: 'assistant', content: 'done' }],
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/sessions/manualLeave%3Adraft-1/turn/append')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
      'X-Tenant-Id': 'tenant-1',
      'X-Project-Id': 'project-1',
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      turn: { turnId: 'turn-1' },
      messages: [{ role: 'assistant', content: 'done' }],
    })
  })

  it('routes businesses through a turn stream envelope', async () => {
    const sessionId = 'appAiRouter:route-turn-route-1'
    const fetchMock = vi.fn(async () => new Response([
      'event: result',
      `data: ${JSON.stringify({
        sessionId,
        turnId: 'turn-route-1',
        text: JSON.stringify({ moduleId: 'manualLeave', confidence: 0.9, reason: 'matched' }),
      })}`,
      '',
      '',
    ].join('\n'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = new FetchAppAiHostTransport('/api/ai', () => ({ Authorization: 'Bearer token-1' }))

    const result = await transport.routeBusiness({
      userInput: '我要请假',
      candidates: [{
        moduleId: 'manualLeave',
        name: '人工请假',
        description: '处理请假申请',
        prompt: '请假业务',
        functions: [{ functionId: 'submitDraft', description: '提交请假申请' }],
      }],
      turn: {
        turnId: 'turn-route-1',
        seq: 2,
        baseRevision: 1,
        queuedAt: '2026-05-13T00:00:00.000Z',
        startedAt: '2026-05-13T00:00:00.000Z',
        maxParallelTurns: 1,
      },
    })

    expect(result).toEqual({
      moduleId: 'manualLeave',
      confidence: 0.9,
      reason: 'matched',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/sessions/appAiRouter%3Aroute-turn-route-1/turn/stream')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      protocolVersion: 3,
      turn: { turnId: 'turn-route-1' },
      scope: {
        moduleId: 'appAiRouter',
        moduleInstanceId: 'route-turn-route-1',
        instanceId: sessionId,
      },
      messages: [expect.objectContaining({ role: 'user' })],
    })
  })

  it('keeps parallel stream turn envelopes isolated for the same session', async () => {
    const sessionId = 'manualLeave:draft-1'
    const textEncoder = new TextEncoder()
    let releaseTurnA: (() => void) | undefined
    let releaseTurnB: (() => void) | undefined
    const gateTurnA = new Promise<void>((resolve) => { releaseTurnA = resolve })
    const gateTurnB = new Promise<void>((resolve) => { releaseTurnB = resolve })
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      const turnId = body.turn.turnId as string
      const gate = turnId === 'turn-a' ? gateTurnA : gateTurnB
      return new Response(new ReadableStream({
        start(controller) {
          void gate.then(() => {
            controller.enqueue(textEncoder.encode([
              'event: result',
              `data: ${JSON.stringify({
                sessionId,
                turnId,
                text: `response:${turnId}`,
              })}`,
              '',
              '',
            ].join('\n')))
            controller.close()
          })
        },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const transport = new FetchAppAiHostTransport('/api/ai')
    const scope = {
      businessRegistrationId: 'manualLeave',
      businessInstanceId: 'draft-1',
      instanceId: sessionId,
      runtimeInstanceId: sessionId,
    }
    const baseTurn = {
      seq: 1,
      baseRevision: 0,
      queuedAt: '2026-05-14T00:00:00.000Z',
      startedAt: '2026-05-14T00:00:00.000Z',
      maxParallelTurns: 2,
    }

    const turnA = transport.streamTurn({
      sessionId,
      scope,
      turn: { ...baseTurn, turnId: 'turn-a' },
      systemPrompt: 'sys',
      tools: [],
      messages: [{ role: 'user', content: 'first' }],
    })
    const turnB = transport.streamTurn({
      sessionId,
      scope,
      turn: { ...baseTurn, seq: 2, turnId: 'turn-b' },
      systemPrompt: 'sys',
      tools: [],
      messages: [{ role: 'user', content: 'second' }],
    })

    await waitForCondition(() => fetchMock.mock.calls.length === 2)
    releaseTurnB?.()
    await expect(turnB).resolves.toMatchObject({ text: 'response:turn-b' })
    releaseTurnA?.()
    await expect(turnA).resolves.toMatchObject({ text: 'response:turn-a' })

    const requests = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        turn: { turnId: 'turn-a' },
        messages: [{ role: 'user', content: 'first' }],
      }),
      expect.objectContaining({
        turn: { turnId: 'turn-b' },
        messages: [{ role: 'user', content: 'second' }],
      }),
    ]))
  })

  it('stages large knowledge projections so guided tools are exposed on demand', async () => {
    const noParams = NO_PARAMS_SCHEMA
    const datasetCreateTable = {
      action: 'page-1@dataset@createTable',
      moduleId: 'dataset',
      modulePath: 'pageDesign/dataset',
      moduleIds: ['pageDesign', 'dataset'],
      description: 'Create a table.',
      paramsSchema: noParams,
      contextParams: [],
    }
    const projection = {
      scope: {
        moduleId: PageDesignModule.moduleId,
        moduleInstanceId: 'page-1',
        instanceId: 'pageDesign:page-1',
        runtimeInstanceId: 'pageDesign:page-1',
      },
      module: {
        moduleId: PageDesignModule.moduleId,
        modulePath: 'pageDesign',
        moduleIds: ['pageDesign'],
        name: 'Page Design',
        description: 'Edit pages.',
        functions: [],
        modules: [],
      },
      promptSnapshot: 'Edit pages.',
      availableFunctions: [
        {
          action: 'page-1@knowledge@guideFunction',
          moduleId: 'knowledge',
          modulePath: 'pageDesign/knowledge',
          moduleIds: ['pageDesign', 'knowledge'],
          description: 'Guide a function.',
          paramsSchema: {
            type: 'object',
            properties: { action: { type: 'string' } },
            required: ['action'],
          },
          contextParams: [],
        },
        {
          action: 'page-1@lifecycle@bootstrap',
          moduleId: 'lifecycle',
          modulePath: 'pageDesign/lifecycle',
          moduleIds: ['pageDesign', 'lifecycle'],
          description: 'Bootstrap edit host.',
          paramsSchema: noParams,
          contextParams: [],
        },
        datasetCreateTable,
        ...Array.from({ length: 25 }, (_, index) => ({
          action: `page-1@dataset@filler${index}`,
          moduleId: 'dataset',
          modulePath: 'pageDesign/dataset',
          moduleIds: ['pageDesign', 'dataset'],
          description: `Filler ${index}.`,
          paramsSchema: noParams,
          contextParams: [],
        })),
      ],
    } as unknown as AiRuntimeStartSessionResult
    const runtime: AppAiBusinessRuntime = {
      moduleId: PageDesignModule.moduleId,
      getRegistrationData: () => ({
        moduleId: PageDesignModule.moduleId,
        name: 'Page Design',
        description: 'Edit pages.',
        functions: [],
        modules: [],
      }),
      resolveBusinessInstance: () => 'page-1',
      startSession: vi.fn(async (): Promise<AiRuntimeStartSessionResult> => projection),
      appendMessage: vi.fn((options): AiRuntimeMessageHistoryEntry => ({
        id: 'history-1',
        seq: 1,
        timestamp: 1,
        kind: 'message' as const,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        instanceId: options.instanceId,
        runtimeInstanceId: options.instanceId,
        role: options.role,
        source: options.source ?? 'system',
        content: options.content,
      })),
      executeFunctionCall: vi.fn(async (options): Promise<AiRuntimeFunctionCallResult<unknown>> => ({
        ok: true,
        data: functionIdFromActionForTest(options.action) === 'guideFunction'
          ? { guide: datasetCreateTable }
          : { created: true },
        summary: 'ok',
      })),
      afterFunctionCall: vi.fn((options): AppAiBusinessLifecycleDirective => (
        functionIdFromActionForTest(options.action) === 'createTable'
          ? { status: 'complete', reason: 'created' }
          : { status: 'continue' }
      )),
      endBusinessInstance: vi.fn(),
      getSessionHistory: () => [],
    }
    const registry = new AppAiBusinessRegistry()
    registry.register(runtime)
    const streamInputs: AppAiStreamTurnInput[] = []
    const streamTurn = vi.fn(async (input: AppAiStreamTurnInput) => {
      streamInputs.push(input)
      if (streamInputs.length === 1) {
        expect(input.tools.some((tool) => tool.function.name.includes('dataset_createTable'))).toBe(false)
        const guideTool = input.tools.find((tool) => tool.function.name.includes('knowledge_guideFunction'))
        expect(guideTool).toBeDefined()
        return {
          text: '',
          toolCalls: [{
            id: 'call_guide',
            type: 'function',
            function: {
              name: guideTool?.function.name,
              arguments: JSON.stringify({ action: 'page-1@dataset@createTable' }),
            },
          }],
        }
      }
      const createTableTool = input.tools.find((tool) => tool.function.name.includes('dataset_createTable'))
      expect(createTableTool).toBeDefined()
      return {
        text: '',
        toolCalls: [{
          id: 'call_create',
          type: 'function',
          function: {
            name: createTableTool?.function.name,
            arguments: '{}',
          },
        }],
      }
    })
    const host = new AppAiHost({
      registry,
      transport: {
        routeBusiness: vi.fn(async () => ({ moduleId: PageDesignModule.moduleId, confidence: 0.95, reason: 'page' })),
        streamTurn,
        appendMessages: vi.fn(async () => {}),
      },
      maxToolRounds: 3,
    })

    await host.createPanelConfig().sender({
      historyMsgs: [{ role: 'user', content: '编辑 page-1' }],
      mode: 'multi',
    })

    expect(streamTurn).toHaveBeenCalledTimes(2)
    expect(runtime.executeFunctionCall).toHaveBeenCalledWith(expect.objectContaining({
      action: 'page-1@knowledge@guideFunction',
    }))
    expect(runtime.executeFunctionCall).toHaveBeenCalledWith(expect.objectContaining({
      action: 'page-1@dataset@createTable',
    }))
  })

  it('reselects page-design scope when the active page changes', async () => {
    const registry = new AppAiBusinessRegistry()
    let activePageId = 'page-a'
    registerAppAiBusinesses({
      registry,
      getPageDesignEditHost: () => ({}) as PageDesignEditHost,
      resolvePageDesignInstanceId: () => activePageId,
    })

    const streamedTurns: AppAiStreamTurnInput[] = []
    const transport: AppAiHostTransport = {
      routeBusiness: vi.fn(async () => ({ moduleId: PageDesignModule.moduleId, confidence: 0.95, reason: 'page design' })),
      streamTurn: vi.fn(async (input) => {
        streamedTurns.push(input)
        return { text: '已进入页面设计', toolCalls: [] }
      }),
      appendMessages: vi.fn(async () => {}),
    }
    const host = new AppAiHost({ registry, transport })
    const sender = host.createPanelConfig().sender

    await sender({
      historyMsgs: [{ role: 'user', content: '编辑 page-a' }],
      mode: 'multi',
    })

    activePageId = 'page-b'

    await sender({
      historyMsgs: [{ role: 'user', content: '编辑 page-b' }],
      mode: 'multi',
    })

    expect(transport.routeBusiness).toHaveBeenCalledTimes(2)
    expect(streamedTurns.map((turn) => turn.scope.businessInstanceId)).toEqual(['page-a', 'page-b'])
    expect(host.getSelectedScope()).toMatchObject({
      businessRegistrationId: PageDesignModule.moduleId,
      businessInstanceId: 'page-b',
    })
  })

  it('reports a clear message when page-design has no active edit host context', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      getPageDesignEditHost: () => ({}) as PageDesignEditHost,
      resolvePageDesignInstanceId: () => null,
    })

    const transport: AppAiHostTransport = {
      routeBusiness: vi.fn(async () => ({ moduleId: PageDesignModule.moduleId, confidence: 0.95, reason: 'page design' })),
      streamTurn: vi.fn(async () => ({ text: '', toolCalls: [] })),
      appendMessages: vi.fn(async () => {}),
    }
    const host = new AppAiHost({ registry, transport })
    const onDelta = vi.fn()

    await host.createPanelConfig().sender({
      historyMsgs: [{ role: 'user', content: '设计 work-evaluation 页面' }],
      mode: 'multi',
      onDelta,
    })

    expect(onDelta).toHaveBeenCalledWith(
      expect.stringContaining('PageDesign 需要先在开发系统中打开并选中一个配置页面。'),
    )
    expect(transport.streamTurn).not.toHaveBeenCalled()
  })

  it('aborts page-design tool loops immediately when the live edit host is unavailable', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      getPageDesignEditHost: () => {
        throw new Error('PageDesign edit host unavailable for page renderer-demo. 请先在开发系统中打开并选中目标配置页面。')
      },
      resolvePageDesignInstanceId: () => 'renderer-demo',
    })

    const appendMessages = vi.fn(async () => {})
    const streamTurn = vi.fn(async (input: AppAiStreamTurnInput) => {
      const describeProgressTool = input.tools.find((tool) => tool.function.name.includes('lifecycle_describeProgress'))
      expect(describeProgressTool).toBeDefined()
      return {
        text: '我来检查当前页面状态。',
        toolCalls: [{
          id: 'call_progress',
          type: 'function',
          function: {
            name: describeProgressTool?.function.name,
            arguments: '{}',
          },
        }],
      }
    })
    const host = new AppAiHost({
      registry,
      transport: {
        routeBusiness: vi.fn(async () => ({ moduleId: PageDesignModule.moduleId, confidence: 0.95, reason: 'page design' })),
        streamTurn,
        appendMessages,
      },
      maxToolRounds: 4,
    })
    const onDelta = vi.fn()

    await host.createPanelConfig().sender({
      historyMsgs: [{ role: 'user', content: '设计 renderer-demo 页面' }],
      mode: 'multi',
      onDelta,
    })

    expect(streamTurn).toHaveBeenCalledTimes(1)
    expect(appendMessages).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('PageDesign edit host unavailable for page renderer-demo'),
        }),
      ]),
    }))
    expect(onDelta).toHaveBeenCalledWith(
      'PageDesign edit host unavailable for page renderer-demo. 请先在开发系统中打开并选中目标配置页面。',
    )
    expect(host.getSelectedScope()).toBeNull()
  })

  it('clears selected scope after a business completes so the next turn reroutes', async () => {
    const registry = new AppAiBusinessRegistry()
    const projection = {
      scope: {
        moduleId: 'task',
        moduleInstanceId: 'task-1',
        instanceId: 'task:task-1',
        runtimeInstanceId: 'task:task-1',
      },
      module: {
        moduleId: 'task',
        modulePath: 'task',
        moduleIds: ['task'],
        name: 'Task Runtime',
        description: 'Finish a task.',
        functions: [],
        modules: [],
      },
      promptSnapshot: 'Finish the task.',
      availableFunctions: [{
        action: 'task-1@task@finish',
        moduleId: 'task',
        modulePath: 'task',
        moduleIds: ['task'],
        description: 'Finish the task.',
        paramsSchema: NO_PARAMS_SCHEMA,
        contextParams: [],
      }],
    } as unknown as AiRuntimeStartSessionResult
    const runtime: AppAiBusinessRuntime = {
      moduleId: 'task',
      getRegistrationData: () => ({
        moduleId: 'task',
        name: 'Task Runtime',
        description: 'Finish a task.',
        functions: [],
        modules: [],
      }),
      resolveBusinessInstance: () => 'task-1',
      startSession: vi.fn(async (): Promise<AiRuntimeStartSessionResult> => projection),
      appendMessage: vi.fn((options): AiRuntimeMessageHistoryEntry => ({
        id: 'task-history-1',
        seq: 1,
        timestamp: 1,
        kind: 'message' as const,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        instanceId: options.instanceId,
        runtimeInstanceId: options.instanceId,
        role: options.role,
        source: options.source ?? 'system',
        content: options.content,
      })),
      executeFunctionCall: vi.fn(async (): Promise<AiRuntimeFunctionCallResult<unknown>> => ({
        ok: true,
        data: { finished: true },
        summary: 'done',
      })),
      afterFunctionCall: vi.fn((): AppAiBusinessLifecycleDirective => ({
        status: 'complete',
        reason: 'done',
        finalAssistantMessage: '任务已完成。',
      })),
      endBusinessInstance: vi.fn(),
      getSessionHistory: () => [],
    }
    registry.register(runtime)

    const streamedTurns: AppAiStreamTurnInput[] = []
    const transport: AppAiHostTransport = {
      routeBusiness: vi.fn(async () => ({ moduleId: 'task', confidence: 0.95, reason: 'task' })),
      streamTurn: vi.fn(async (input) => {
        streamedTurns.push(input)
        if (streamedTurns.length === 1) {
          const finishTool = input.tools.find((tool: AppAiStreamTurnInput['tools'][number]) => tool.function.name.includes('finish'))
          return {
            text: '',
            toolCalls: [{
              id: 'call_finish',
              type: 'function',
              function: {
                name: finishTool?.function.name,
                arguments: '{}',
              },
            }],
          }
        }
        return { text: '继续处理', toolCalls: [] }
      }),
      appendMessages: vi.fn(async () => {}),
    }
    const host = new AppAiHost({ registry, transport })
    const sender = host.createPanelConfig().sender

    await sender({
      historyMsgs: [{ role: 'user', content: '完成任务' }],
      mode: 'multi',
    })

    expect(host.getSelectedScope()).toBeNull()

    await sender({
      historyMsgs: [{ role: 'user', content: '再处理一次' }],
      mode: 'multi',
    })

    expect(transport.routeBusiness).toHaveBeenCalledTimes(2)
    expect(runtime.endBusinessInstance).toHaveBeenCalledTimes(1)
  })

  it('uploads AI attachments with auth headers and FormData body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      fileId: 'file-1',
      name: 'note.txt',
      size: 5,
      mimeType: 'text/plain',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })

    const result = await uploadAppAiAttachment(file, '/api/ai', () => ({ Authorization: 'Bearer token-1' }))

    expect(result).toEqual({
      fileId: 'file-1',
      name: 'note.txt',
      size: 5,
      mimeType: 'text/plain',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/upload')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-1' })
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(file)
  })
})

function functionIdFromActionForTest(action: string): string {
  return action.split('@').at(-1) ?? ''
}
