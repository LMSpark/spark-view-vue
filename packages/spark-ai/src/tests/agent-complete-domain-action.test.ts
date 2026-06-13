import { describe, expect, it } from 'vitest'

import {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentToolLoopRunner,
  ClassModelAgentAdapter,
  DefaultAiAgentSessionStore,
  type AiAgentFunctionCallHistoryEntry,
  type AiAgentTransportToolCall,
  type AiAgentTurnCallbacks,
} from '../agent'
import { CLASS_MODEL_TOOL_NAMES, type AiRuntimeApiMetadataJson } from '../class-model'

class PlanningDomain {
  public ready = false
  public completeCalls = 0

  public write(): { ready: boolean } {
    this.ready = true
    return { ready: this.ready }
  }

  public completeProjectPlanning(input: { summary?: string }) {
    this.completeCalls += 1
    if (!this.ready) {
      return {
        ok: false,
        code: 'PROJECT_PLANNING_NOT_READY',
        msg: 'projectPlanning is not ready.',
        fix: '先查询 write 的 action guide，再执行 model_script 写入领域数据，之后再次 agent_complete。',
        requiredQueries: [
          'model_action_guide({ kind: "planningdomain", actionName: "write" })',
        ],
        missingFacts: ['ready'],
        nextStep: '执行 model_script：await this.write({})',
      }
    }
    return {
      ok: true,
      completed: true,
      summary: input.summary ?? 'done',
      data: { ready: this.ready },
    }
  }
}

const metadata = {
  schemaVersion: 1,
  rootApi: {
    kind: 'planningdomain',
    name: 'PlanningDomain',
    description: 'Planning domain for agent_complete tests.',
    actions: [
      {
        name: 'write',
        methodName: 'write',
        description: 'Write domain state before completion.',
        paramsSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  },
} satisfies AiRuntimeApiMetadataJson

describe('agent_complete domain action', () => {
  it('executes the configured domain model completion method', async () => {
    const instance = new PlanningDomain()
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: PlanningDomain,
      metadata,
      options: {
        instance,
        agentCompleteMethodName: 'completeProjectPlanning',
      },
    })

    const host = {
      moduleId: 'planningdomain',
      moduleInstanceId: 'demo',
      instanceId: 'demo',
    }
    const rejected = await registration.runtime.executeTool(
      CLASS_MODEL_TOOL_NAMES.agentComplete,
      { summary: 'done' },
      host,
    )

    expect(rejected.ok).toBe(false)
    expect(rejected.checks?.[0]?.code).toBe('PROJECT_PLANNING_NOT_READY')
    expect(instance.completeCalls).toBe(1)

    instance.ready = true
    const accepted = await registration.runtime.executeTool(
      CLASS_MODEL_TOOL_NAMES.agentComplete,
      { summary: 'done' },
      host,
    )

    expect(accepted.ok).toBe(true)
    expect(accepted.data).toMatchObject({
      completed: true,
      summary: 'done',
      ready: true,
    })
    expect(instance.completeCalls).toBe(2)
  })

  it('keeps the tool loop alive until the domain completion method accepts agent_complete', async () => {
    const instance = new PlanningDomain()
    const sessionStore = new DefaultAiAgentSessionStore()
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: PlanningDomain,
      metadata,
      options: {
        instance,
        agentCompleteMethodName: 'completeProjectPlanning',
        sessionStore,
      },
    })
    const scope = new AiAgentScope('planningdomain', 'demo', 'demo', 'demo')
    const runtimeContext = new AiAgentRuntimeContext('planningdomain', 'demo', 'demo')
    sessionStore.startSession(runtimeContext)

    const toolCalls = [
      toolCall('call-1', CLASS_MODEL_TOOL_NAMES.agentComplete, { summary: 'done' }),
      toolCall('call-2', CLASS_MODEL_TOOL_NAMES.actionGuide, { kind: 'planningdomain', actionName: 'write' }),
      toolCall('call-3', CLASS_MODEL_TOOL_NAMES.script, { script: 'return await this.write({})' }),
      toolCall('call-4', CLASS_MODEL_TOOL_NAMES.agentComplete, { summary: 'done' }),
    ]
    let round = 0
    const appendedToolResults: string[] = []
    const callbacks: AiAgentTurnCallbacks = {
      executeTurn: async () => ({
        text: '',
        toolCalls: [toolCalls[round++]!],
      }),
      appendMessages: async input => {
        appendedToolResults.push(...input.messages
          .filter(message => message.role === 'tool')
          .map(message => message.content))
      },
    }

    await new AiAgentToolLoopRunner(callbacks, 8).runToolLoop({
      registration,
      scope,
      request: { historyMsgs: [{ role: 'user', content: 'finish planning' }] },
      turn: {
        turnId: 'turn-1',
        seq: 1,
        baseRevision: 0,
        queuedAt: '2026-06-13T00:00:00.000Z',
        startedAt: '2026-06-13T00:00:00.000Z',
        maxParallelTurns: 1,
      },
      clearSelected: () => {},
    })

    const history = sessionStore.getSessionHistory(runtimeContext)
    const completeCalls = history.filter((entry): entry is AiAgentFunctionCallHistoryEntry =>
      entry.kind === 'functionCall' && entry.toolName === CLASS_MODEL_TOOL_NAMES.agentComplete)

    expect(round).toBe(4)
    expect(instance.ready).toBe(true)
    expect(instance.completeCalls).toBe(2)
    expect(completeCalls.map(entry => entry.status)).toEqual(['failed', 'completed'])
    expect(sessionStore.getSession(runtimeContext)?.status).toBe('Stopped')
    expect(appendedToolResults.some(content => content.includes('PROJECT_PLANNING_NOT_READY'))).toBe(true)
  })
})

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
): AiAgentTransportToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}
