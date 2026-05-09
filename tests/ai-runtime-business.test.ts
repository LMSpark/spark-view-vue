import { describe, expect, it } from 'vitest'

import {
  AiRuntime,
  type AiFunctionRegistration,
  type AiModuleRegistration,
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
  ensure(context: FunctionExecutionContext): LeaveFormState
  release(instanceId: string): void
}

function createDeterministicRuntime(): AiRuntimeApi {
  let record = 0
  return new AiRuntime({
    createInstanceId: (_moduleId, _moduleInstanceId) => 'leave-1',
    createRecordId: (kind) => `${kind}-${++record}`,
    now: () => 1778030000000 + record,
  })
}

function createLeaveFormService(): LeaveFormService {
  const states = new Map<string, LeaveFormState>()
  return {
    get: (instanceId) => states.get(instanceId),
    ensure(context) {
      const existing = states.get(context.runtimeInstanceId)
      if (existing !== undefined) return existing
      const state: LeaveFormState = {
        draft: {
          reason: null,
          days: null,
        },
      }
      states.set(context.runtimeInstanceId, state)
      return state
    },
    release: (instanceId) => { states.delete(instanceId) },
  }
}

function createLeaveModule(service: LeaveFormService): AiModuleRegistration {
  const functions: ReadonlyArray<AiFunctionRegistration> = [
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
      execute(args, context) {
        const state = service.ensure(context)
        state.draft.reason = (args as SetReasonArgs).reason
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
      execute(args, context) {
        const state = service.ensure(context)
        state.draft.days = (args as SetDaysArgs).days
        return { accepted: true }
      },
    },
  ]

  return {
    moduleId: 'leaveApproval',
    name: 'Leave approval',
    description: 'Help users finish a leave request.',
    prompt: 'Collect leave reason and leave days only.',
    getFunctions: () => functions,
    releaseInstance(context) {
      service.release(context.runtimeInstanceId)
    },
  }
}

function createDepartmentModule(spy: { args?: unknown; context?: FunctionExecutionContext }): AiModuleRegistration {
  return {
    moduleId: 'department',
    name: 'Department',
    description: 'Manage department information.',
    instanceParam: { name: 'departmentId', description: '当前部门 ID' },
    getFunctions: () => [],
    modules: [
      {
        moduleId: 'personnel',
        name: 'Personnel',
        description: 'Manage personnel in a department.',
        instanceParam: { name: 'personId', description: '当前人员 ID' },
        getFunctions: () => [],
        modules: [
          {
            moduleId: 'basicInfo',
            name: 'Basic info',
            description: 'Manage basic personnel information.',
            getFunctions: () => [
              {
                functionId: 'update',
                description: 'Update person basic info.',
                paramsSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                  },
                  required: ['name'],
                },
                execute(args, context) {
                  spy.args = args
                  spy.context = context
                  return { updated: true }
                },
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('AI runtime recursive module API', () => {
  it('resolves active session by module instance scope', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))

    const started = await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance-a' })

    const scoped = core.getInstanceByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance-a' })
    expect(scoped?.instanceId).toBe(started.instanceId)
    expect(scoped?.moduleInstanceId).toBe('leave-instance-a')
    expect(core.getInstanceByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance-miss' })).toBeNull()
  })

  it('registers module information and starts a runtime instance without exposing sessionId', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))

    const started = await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })

    expect(started.instanceId).toBe('leave-1')
    expect(started.moduleId).toBe('leaveApproval')
    expect(started.status).toBe('Ready')
    expect('sessionId' in started).toBe(false)
    expect(started.promptSnapshot).toContain('Collect leave reason')
    expect(started.availableFunctions.map((definition) => definition.action)).toEqual([
      'leaveApproval/setReason',
      'leaveApproval/setDays',
    ])
    expect(started.availableFunctions[0]?.failureModes).toEqual([
      { code: 'REASON_REQUIRED', when: 'reason is empty', fix: 'Provide a non-empty reason.' },
    ])
    expect(service.get('leave-1')).toBeUndefined()
  })

  it('executes one function call through the instanceId envelope and writes core history', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))
    await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval/setReason',
      args: { reason: 'family care' },
    })

    expect(output.result).toEqual({
      ok: true,
      data: { accepted: true },
      summary: 'leaveApproval/setReason executed',
    })
    expect(service.get('leave-1')?.draft.reason).toBe('family care')
    expect(output.history.functionCalls).toHaveLength(1)
    expect(output.history.functionCalls[0]?.action).toBe('leaveApproval/setReason')
    expect(output.history.functionCalls[0]?.args).toEqual({ reason: 'family care' })
  })

  it('projects recursive module context params and strips them before execute', async () => {
    const core = createDeterministicRuntime()
    const spy: { args?: unknown; context?: FunctionExecutionContext } = {}
    core.registerModule(createDepartmentModule(spy))
    const started = await core.startInstance({ moduleId: 'department', moduleInstanceId: 'dept-1' })
    core.setActivePath({
      instanceId: started.instanceId,
      bindings: [{ modulePath: 'department/personnel', instanceId: 'person-9' }],
    })

    const update = started.availableFunctions.find((item) => item.action === 'department/personnel/basicInfo/update')
    expect(update?.paramsSchema).toMatchObject({
      type: 'object',
      properties: {
        departmentId: { type: 'string' },
        personId: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['name', 'departmentId', 'personId'],
    })

    const output = await core.executeFunctionCall({
      instanceId: started.instanceId,
      action: 'department/personnel/basicInfo/update',
      args: { name: 'Ada' },
    })

    expect(output.result).toMatchObject({ ok: true, data: { updated: true } })
    expect(spy.args).toEqual({ name: 'Ada' })
    expect(spy.context?.moduleInstances).toEqual({ departmentId: 'dept-1', personId: 'person-9' })
    expect(spy.context?.modulePath).toBe('department/personnel/basicInfo')
  })

  it('rejects active path conflicts and missing module instances', async () => {
    const core = createDeterministicRuntime()
    core.registerModule(createDepartmentModule({}))
    const started = await core.startInstance({ moduleId: 'department', moduleInstanceId: 'dept-1' })
    core.setActivePath({
      instanceId: started.instanceId,
      bindings: [{ modulePath: 'department/personnel', instanceId: 'person-1' }],
    })

    const conflict = await core.executeFunctionCall({
      instanceId: started.instanceId,
      action: 'department/personnel/basicInfo/update',
      args: { personId: 'person-2', name: 'Ada' },
    })
    expect(conflict.result.ok).toBe(false)
    if (!conflict.result.ok) expect(conflict.result.code).toBe('CONTEXT_MISMATCH')

    core.clearActivePath({ instanceId: started.instanceId })
    const missing = await core.executeFunctionCall({
      instanceId: started.instanceId,
      action: 'department/personnel/basicInfo/update',
      args: { name: 'Ada' },
    })
    expect(missing.result.ok).toBe(false)
    if (!missing.result.ok) expect(missing.result.code).toBe('MISSING_CONTEXT_INSTANCE')
  })

  it('does not update active path implicitly after function execution', async () => {
    const core = createDeterministicRuntime()
    const spy: { args?: unknown; context?: FunctionExecutionContext } = {}
    core.registerModule(createDepartmentModule(spy))
    const started = await core.startInstance({ moduleId: 'department', moduleInstanceId: 'dept-1' })

    const output = await core.executeFunctionCall({
      instanceId: started.instanceId,
      action: 'department/personnel/basicInfo/update',
      args: { personId: 'person-9', name: 'Ada' },
    })

    expect(output.result.ok).toBe(true)
    expect(core.getActivePath(started.instanceId).bindings).toEqual([])
  })

  it('fails fast when action module and instance module do not match', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))
    await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'otherModule/setReason',
      args: { reason: 'family care' },
    })

    expect(output.result.ok).toBe(false)
    if (output.result.ok) return
    expect(output.result.code).toBe('MODULE_MISMATCH')
    expect(output.result.fix).toContain('getAvailableFunctions')
  })

  it('validates args from the projected function schema before module execution', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))
    await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })

    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval/setDays',
      args: { days: '3' },
    })

    expect(output.result.ok).toBe(false)
    if (output.result.ok) return
    expect(output.result.code).toBe('INVALID_ARGS')
    expect(output.result.msg).toContain('days')
    expect(service.get('leave-1')).toBeUndefined()
  })

  it('pauses and resumes a runtime instance without creating a new instanceId', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))
    await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })

    const paused = await core.stopInstance({ instanceId: 'leave-1', mode: 'pause', reason: 'waiting for user' })
    expect(paused.instance.status).toBe('Paused')

    const blocked = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval/setReason',
      args: { reason: 'family care' },
    })
    expect(blocked.result.ok).toBe(false)
    if (!blocked.result.ok) expect(blocked.result.code).toBe('INSTANCE_NOT_READY')

    const resumed = await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })
    expect(resumed.instanceId).toBe('leave-1')
    expect(resumed.status).toBe('Ready')
    expect(core.listInstances()).toHaveLength(1)
  })

  it('stops by module scope and asks the module to release instance state', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))
    await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'stop-by-scope' })
    await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval/setReason',
      args: { reason: 'family care' },
    })

    const stopped = await core.stopInstanceByModuleScope({
      moduleId: 'leaveApproval',
      moduleInstanceId: 'stop-by-scope',
      mode: 'stop',
      reason: 'done',
    })

    expect(stopped.instance.status).toBe('Stopped')
    expect(service.get('leave-1')).toBeUndefined()
    expect(core.getInstanceHistoryByModuleScope({ moduleId: 'leaveApproval', moduleInstanceId: 'stop-by-scope' })).not.toBeNull()
    await expect(core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'stop-by-scope' })).rejects.toThrow('terminal runtime instance')
  })

  it('publishes lifecycle and function events as an observation surface', async () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    const eventTypes: string[] = []
    core.subscribe((event) => { eventTypes.push(event.type) })
    core.registerModule(createLeaveModule(service))

    await core.startInstance({ moduleId: 'leaveApproval', moduleInstanceId: 'leave-instance' })
    await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'leaveApproval/setReason',
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

  it('rejects duplicate module registrations instead of creating parallel registries', () => {
    const core = createDeterministicRuntime()
    const service = createLeaveFormService()
    core.registerModule(createLeaveModule(service))

    expect(() => core.registerModule(createLeaveModule(service))).toThrow('Duplicate AI module registration')
  })

  it('wraps domain objects that happen to contain an ok field', async () => {
    const core = createDeterministicRuntime()
    core.registerModule({
      moduleId: 'domainResult',
      name: 'Domain result',
      description: 'Returns domain data with an ok field.',
      getFunctions: () => [{
        functionId: 'readDomainState',
        description: 'Read domain state.',
        paramsSchema: {},
        execute: () => ({ ok: true, accepted: true }),
      }],
    })

    await core.startInstance({ moduleId: 'domainResult', moduleInstanceId: 'domain-instance' })
    const output = await core.executeFunctionCall({
      instanceId: 'leave-1',
      action: 'domainResult/readDomainState',
      args: {},
    })

    expect(output.result).toEqual({
      ok: true,
      data: { ok: true, accepted: true },
      summary: 'domainResult/readDomainState executed',
    })
  })
})
