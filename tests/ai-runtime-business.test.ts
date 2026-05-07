import { describe, expect, it } from 'vitest'

import {
  AiRuntime,
  type AiBusinessRegistration,
  type AiFunctionRegistration,
  type AiRuntimeApi,
  type FunctionExecutionContext,
} from '../packages/spark-ai/src'

interface LeaveFormState {
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

interface LeaveFormService {
  get(instanceId: string): LeaveFormState | undefined
  ensure(context: FunctionExecutionContext<'leaveApproval', 'form'>): LeaveFormState
  release(instanceId: string): void
}

function createDeterministicRuntime(): AiRuntimeApi {
  let record = 0
  return new AiRuntime({
    createInstanceId: (_businessId, _businessInstanceId) => 'leave-1',
    createRecordId: (kind) => `${kind}-${++record}`,
    now: () => 1778030000000 + record,
  })
}

function createLeaveFormService(): LeaveFormService {
  const states = new Map<string, LeaveFormState>()
  return {
    get: (instanceId) => states.get(instanceId),
    ensure(context) {
      const existing = states.get(context.instanceId)
      if (existing !== undefined) return existing
      const state: LeaveFormState = {
        draft: {
          reason: null,
          days: null,
        },
      }
      states.set(context.instanceId, state)
      return state
    },
    release: (instanceId) => { states.delete(instanceId) },
  }
}

function resolveByScope(
  core: AiRuntimeApi,
  businessId: string,
  businessInstanceId: string,
): ReturnType<AiRuntimeApi['getInstanceByBusinessScope']> {
  return core.getInstanceByBusinessScope({ businessId, businessInstanceId })
}

function createLeaveBusiness(service: LeaveFormService): AiBusinessRegistration<'leaveApproval'> {
  const functions: ReadonlyArray<AiFunctionRegistration<unknown, unknown, 'leaveApproval', 'form'>> = [
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
        const state = service.ensure(context)
        state.draft.reason = args.reason
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
        const state = service.ensure(context)
        state.draft.days = args.days
        return { accepted: true }
      },
    },
  ]

  return {
    businessId: 'leaveApproval',
    name: 'Leave approval',
    description: 'Help users finish a leave request.',
    modules: [{
      moduleId: 'form',
      name: 'Leave form',
      description: 'Collects leave form fields.',
      prompt: 'Collect leave reason and leave days only.',
      getFunctions: () => functions,
    }],
    releaseInstance(context) {
      service.release(context.instanceId)
    },
  }
}

describe('AI runtime business-first API', () => {
  it('resolves active session by business instance scope', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))

    const started = await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance-a' })

    const scoped = resolveByScope(core, 'leaveApproval', 'leave-instance-a')
    expect(scoped?.instanceId).toBe(started.instanceId)
    expect(scoped?.businessInstanceId).toBe('leave-instance-a')
    expect(resolveByScope(core, 'leaveApproval', 'leave-instance-miss')).toBeNull()
  })

  it('registers business information and starts a runtime instance without exposing sessionId', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))

    const started = await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })

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
    expect(service.get('leave-1')).toBeUndefined()
  })

  it('executes one function call through the instanceId envelope and writes core history', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))
    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })

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
    expect(service.get('leave-1')?.draft.reason).toBe('family care')
    expect(output.history.functionCalls).toHaveLength(1)
    expect(output.history.functionCalls[0]?.action).toBe('leaveApproval@form@setReason')
    expect(output.history.functionCalls[0]?.args).toEqual({ reason: 'family care' })
    expect('sessionId' in output.history).toBe(false)
  })

  it('fails fast when action business and instance business do not match', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))
    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })

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
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))
    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setDays',
      args: { days: '3' },
    })

    expect(output.result.ok).toBe(false)
    if (output.result.ok) return
    expect(output.result.code).toBe('INVALID_ARGS')
    expect(output.result.msg).toContain('days')
    expect(service.get('leave-1')).toBeUndefined()
  })

  it('stores user and assistant messages in core history by instanceId', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))
    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })

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

  it('pauses and resumes a runtime instance without creating a new instanceId', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))
    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })

    const paused = await core.stopInstance({ instanceId: 'leave-1', mode: 'pause', reason: 'waiting for user' })
    expect(paused.instance.status).toBe('Paused')

    const blocked = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setReason',
      args: { reason: 'family care' },
    })
    expect(blocked.result.ok).toBe(false)
    if (!blocked.result.ok) expect(blocked.result.code).toBe('INSTANCE_NOT_READY')

    const resumed = await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })
    expect(resumed.instanceId).toBe('leave-1')
    expect(resumed.status).toBe('Ready')
    expect(core.listInstances()).toHaveLength(1)
  })

  it('stops a runtime instance and asks the business service to release instance state', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))
    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })
    await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setReason',
      args: { reason: 'family care' },
    })

    const stopped = await core.stopInstance({ instanceId: 'leave-1', mode: 'stop', reason: 'done' })

    expect(stopped.instance.status).toBe('Stopped')
    expect(service.get('leave-1')).toBeUndefined()
    expect(core.getInstanceDetail('leave-1')?.modules.map((module) => module.moduleId)).toEqual(['form'])
    await expect(core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })).rejects.toThrow('terminal runtime instance')
  })

  it('stops by business scope and keeps business-owned state aligned', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))

    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'stop-by-scope' })
    const stopped = await core.stopInstanceByBusinessScope({
      businessId: 'leaveApproval',
      businessInstanceId: 'stop-by-scope',
      mode: 'stop',
      reason: 'done',
    })

    expect(stopped.instance.instanceId).toBe('leave-1')
    expect(stopped.instance.status).toBe('Stopped')
    expect(stopped.history.lifecycleMarkers.map((record) => record.status)).toContain('Stopped')
    expect(service.get('leave-1')).toBeUndefined()
    expect(core.getInstanceHistoryByBusinessScope({ businessId: 'leaveApproval', businessInstanceId: 'stop-by-scope' })).not.toBeNull()
  })

  it('publishes lifecycle and function events as an observation surface', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    const eventTypes: string[] = []
    core.subscribe((event) => { eventTypes.push(event.type) })
    core.registerBusiness(createLeaveBusiness(service))

    await core.startInstance({ businessId: 'leaveApproval', businessInstanceId: 'leave-instance' })
    await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval@form@setReason',
      args: { reason: 'family care' },
    })

    expect(eventTypes).toEqual(expect.arrayContaining([
      'instance.starting',
      'functions.exposed',
      'instance.ready',
      'function.before',
      'history.functionCall.appended',
      'function.succeeded',
    ]))
  })

  it('rejects duplicate business registrations instead of creating parallel registries', () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerBusiness(createLeaveBusiness(service))

    expect(() => core.registerBusiness(createLeaveBusiness(service))).toThrow('Duplicate AI business registration')
  })

  it('wraps domain objects that happen to contain an ok field', async () => {
    const core = createDeterministicRuntime()
    core.registerBusiness({
      businessId: 'domainResult',
      name: 'Domain result',
      description: 'Returns domain data with an ok field.',
      modules: [{
        moduleId: 'form',
        name: 'Form',
        description: 'Domain return module.',
        getFunctions: () => [{
          functionId: 'readDomainState',
          description: 'Read domain state.',
          paramsSchema: {},
          execute: () => ({ ok: true, accepted: true }),
        }],
      }],
    })

    await core.startInstance({ businessId: 'domainResult', businessInstanceId: 'domain-instance' })
    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'domainResult@form@readDomainState',
      args: {},
    })

    expect(output.result).toEqual({
      ok: true,
      data: { ok: true, accepted: true },
      summary: 'domainResult@form@readDomainState executed',
    })
  })

  it('defers final stop and release while a function is executing', async () => {
    const core = createDeterministicRuntime()
    let releaseCount = 0
    let finishExecution: ((value: { accepted: true }) => void) | undefined
    const executionGate = new Promise<{ accepted: true }>((resolve) => {
      finishExecution = resolve
    })

    core.registerBusiness({
      businessId: 'slowBusiness',
      name: 'Slow business',
      description: 'Long running business function.',
      modules: [{
        moduleId: 'form',
        name: 'Form',
        description: 'Slow module.',
        getFunctions: () => [{
          functionId: 'submit',
          description: 'Submit slowly.',
          paramsSchema: {},
          execute: () => executionGate,
        }],
      }],
      releaseInstance: () => {
        releaseCount += 1
      },
    })

    await core.startInstance({ businessId: 'slowBusiness', businessInstanceId: 'slow-instance' })
    const running = core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'slowBusiness@form@submit',
      args: {},
    })
    await Promise.resolve()

    const stopping = await core.stopInstance({ instanceId: 'leave-1', mode: 'stop', reason: 'user requested stop' })
    expect(stopping.instance.status).toBe('Stopping')
    expect(releaseCount).toBe(0)

    finishExecution?.({ accepted: true })
    const output = await running

    expect(output.result.ok).toBe(true)
    expect(core.getInstanceDetail('leave-1')?.status).toBe('Stopped')
    expect(releaseCount).toBe(1)
  })
})
