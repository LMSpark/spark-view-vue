import { describe, expect, it } from 'vitest'

import {
  createAiCore,
  type AiCore,
  type IBusinessDefinition,
  type IFunctionDefinition,
  type IModule,
  type ModuleRuntime,
} from '../packages/spark-ai/src'

interface LeaveFormRuntime extends ModuleRuntime {
  draft: {
    reason: string | null
    days: number | null
  }
}

interface SetReasonArgs {
  reason: string
}

interface SetDaysArgs {
  days: number
}

function createDeterministicCore(): AiCore {
  let record = 0
  return createAiCore({
    createInstanceId: () => 'leave-1',
    createRecordId: (kind) => `${kind}-${++record}`,
    now: () => 1778030000000 + record,
  })
}

function createLeaveFormModule(core: AiCore): IModule<LeaveFormRuntime> {
  const functions: ReadonlyArray<IFunctionDefinition<unknown, unknown>> = [
    {
      functionId: 'setReason',
      description: 'Set leave reason.',
      paramsSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        required: ['reason'],
      },
      failureModes: [{ code: 'REASON_REQUIRED', when: 'reason is empty', fix: 'Provide a non-empty reason.' }],
      execute(args: SetReasonArgs, context) {
        const runtime = context.moduleRuntime as LeaveFormRuntime
        runtime.draft.reason = args.reason
        return { accepted: true }
      },
    },
    {
      functionId: 'setDays',
      description: 'Set leave days.',
      paramsSchema: {
        type: 'object',
        properties: {
          days: { type: 'number' },
        },
        required: ['days'],
      },
      execute(args: SetDaysArgs, context) {
        const runtime = context.moduleRuntime as LeaveFormRuntime
        runtime.draft.days = args.days
        return { accepted: true }
      },
    },
  ]

  return {
    moduleId: 'form',
    name: 'Leave form',
    description: 'Collects leave form fields.',
    createRuntime: () => ({
      draft: {
        reason: null,
        days: null,
      },
      toSnapshot() {
        return { draft: { ...this.draft } }
      },
    }),
    getPrompt: () => 'Collect leave reason and leave days only.',
    getInstance(instanceId: string) {
      return core.runtimeReader.get<LeaveFormRuntime>(instanceId, 'form')
    },
    getFunctions: () => functions,
  }
}

function createLeaveBusiness(core: AiCore): IBusinessDefinition {
  return {
    businessId: 'leaveApproval',
    name: 'Leave approval',
    description: 'Help users finish a leave request.',
    modules: [createLeaveFormModule(core)],
  }
}

describe('AI core business-first runtime', () => {
  it('registers only business definitions and starts an instance without exposing sessionId', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))

    const started = await core.startSession({ businessId: 'leaveApproval' })

    expect(started.instanceId).toBe('leave-1')
    expect(started.businessId).toBe('leaveApproval')
    expect(started.status).toBe('Ready')
    expect('sessionId' in started).toBe(false)
    expect(started.promptSnapshot).toContain('Collect leave reason')
    expect(started.availableFunctions.map((definition) => definition.action)).toEqual([
      'leaveApproval@form@setReason',
      'leaveApproval@form@setDays',
    ])
    expect(started.availableFunctions[0]?.failureModes).toEqual([
      { code: 'REASON_REQUIRED', when: 'reason is empty', fix: 'Provide a non-empty reason.' },
    ])

    const runtime = core.runtimeReader.get<LeaveFormRuntime>('leave-1', 'form')
    expect(runtime?.draft).toEqual({ reason: null, days: null })
  })

  it('executes one function call through the instanceId envelope and writes core history', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))
    await core.startSession({ businessId: 'leaveApproval' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setReason',
      args: { reason: 'family care' },
    })

    expect(output.result).toEqual({
      ok: true,
      data: { accepted: true },
      summary: 'leaveApproval@form@setReason executed',
    })
    expect(core.runtimeReader.get<LeaveFormRuntime>('leave-1', 'form')?.draft.reason).toBe('family care')
    expect(output.history.functionCalls).toHaveLength(1)
    expect(output.history.functionCalls[0]?.action).toBe('leaveApproval@form@setReason')
    expect(output.history.functionCalls[0]?.args).toEqual({ reason: 'family care' })
    expect('sessionId' in output.history).toBe(false)
  })

  it('fails fast when action business and instance business do not match', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))
    await core.startSession({ businessId: 'leaveApproval' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'otherBusiness@form@setReason',
      args: { reason: 'family care' },
    })

    expect(output.result.ok).toBe(false)
    if (output.result.ok) return
    expect(output.result.code).toBe('BUSINESS_MISMATCH')
    expect(output.result.fix).toContain('getAvailableFunctions')
  })

  it('validates args from the function schema before business execution', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))
    await core.startSession({ businessId: 'leaveApproval' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setDays',
      args: { days: '3' },
    })

    expect(output.result.ok).toBe(false)
    if (output.result.ok) return
    expect(output.result.code).toBe('INVALID_ARGS')
    expect(output.result.msg).toContain('days')
    expect(core.runtimeReader.get<LeaveFormRuntime>('leave-1', 'form')?.draft.days).toBe(null)
  })

  it('stores user and assistant messages in core history by instanceId', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))
    await core.startSession({ businessId: 'leaveApproval' })

    const history = core.appendMessages({
      instanceId: 'leave-1',
      messages: [
        { role: 'user', content: 'I need leave.' },
        { role: 'assistant', content: 'How many days?' },
      ],
    })

    expect(history.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(history.messages.map((message) => message.content)).toEqual(['I need leave.', 'How many days?'])
    expect('sessionId' in history).toBe(false)
  })

  it('pauses and resumes an instance without creating a new instanceId', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))
    await core.startSession({ businessId: 'leaveApproval' })

    const paused = await core.stopSession({ instanceId: 'leave-1', mode: 'pause', reason: 'waiting for user' })
    expect(paused.instance.status).toBe('Paused')

    const blocked = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setReason',
      args: { reason: 'family care' },
    })
    expect(blocked.result.ok).toBe(false)
    if (!blocked.result.ok) expect(blocked.result.code).toBe('INSTANCE_NOT_READY')

    const resumed = await core.startSession({ businessId: 'leaveApproval', instanceId: 'leave-1' })
    expect(resumed.instanceId).toBe('leave-1')
    expect(resumed.status).toBe('Ready')
    expect(core.listInstances()).toHaveLength(1)
  })

  it('stops an instance and releases module runtime from the core directory', async () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))
    await core.startSession({ businessId: 'leaveApproval' })

    const stopped = await core.stopSession({ instanceId: 'leave-1', mode: 'stop', reason: 'done' })

    expect(stopped.instance.status).toBe('Stopped')
    expect(core.runtimeReader.get<LeaveFormRuntime>('leave-1', 'form')).toBe(null)
    expect(core.getInstanceDetail('leave-1')?.modules).toEqual([])
    await expect(core.startSession({ businessId: 'leaveApproval', instanceId: 'leave-1' })).rejects.toThrow('terminal instance')
  })

  it('publishes lifecycle and function events as an observation surface', async () => {
    const core = createDeterministicCore()
    const eventTypes: string[] = []
    core.subscribe((event) => { eventTypes.push(event.type) })
    core.registerBusiness(createLeaveBusiness(core))

    await core.startSession({ businessId: 'leaveApproval' })
    await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setReason',
      args: { reason: 'family care' },
    })

    expect(eventTypes).toEqual(expect.arrayContaining([
      'instance.starting',
      'module.available',
      'functions.exposed',
      'instance.ready',
      'function.before',
      'history.functionCall.appended',
      'function.succeeded',
    ]))
  })

  it('rejects duplicate business definitions instead of creating parallel registries', () => {
    const core = createDeterministicCore()
    core.registerBusiness(createLeaveBusiness(core))

    expect(() => core.registerBusiness(createLeaveBusiness(core))).toThrow('Duplicate AI business definition')
  })
})