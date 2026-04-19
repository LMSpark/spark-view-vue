import { beforeEach, describe, expect, it } from 'vitest'
import {
  actionToFunctionName,
  clearDomains,
  clearRegistry,
  createRepeatDetectionMonitor,
  createSession,
  executeStill,
  registerEditStills,
  runStillsLoop,
  type LlmResponse,
  type SessionBackend,
  type ToolCall,
  type ToolDefinition,
  type IStillSession,
} from '@spark-view/spark-ai'
import {
  buildFineGrainedEditContext,
  buildFineGrainedLoopSystemPrompt,
  buildFineGrainedLoopUserPrompt,
} from '../src/views/app/dev-system/datasetFineEditOrchestration'

class ScriptedBackend implements SessionBackend {
  systemPrompt = ''
  userPrompt = ''
  tools: ToolDefinition[] = []
  round = 0
  appendedMessages: Array<Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>> = []

  async createSession(systemPrompt: string, userPrompt: string, _windowSize: number, tools?: ToolDefinition[]): Promise<string> {
    this.systemPrompt = systemPrompt
    this.userPrompt = userPrompt
    this.tools = tools ?? []
    return 'scripted-session'
  }

  async executeTurn(): Promise<LlmResponse | null> {
    this.round += 1
    switch (this.round) {
      case 1:
        return {
          text: '',
          toolCalls: [
            makeToolCall('1', 'session.describe', {}),
            makeToolCall('2', 'stills.capabilities', {}),
          ],
        }
      case 2:
        return {
          text: '',
          toolCalls: [
            makeToolCall('3', 'stills.actionSpec', { action: 'datasetTool.createColumn' }),
            makeToolCall('4', 'stills.actionSpec', { action: 'dataset.export' }),
          ],
        }
      case 3:
        return {
          text: '',
          toolCalls: [
            makeToolCall('5', 'datasetTool.createColumn', {
              tableName: 'Orders',
            }),
          ],
        }
      case 4:
        return {
          text: '',
          toolCalls: [
            makeToolCall('6', 'stills.actionSpec', { action: 'datasetTool.createColumn' }),
          ],
        }
      case 5:
        return {
          text: '',
          toolCalls: [
            makeToolCall('7', 'datasetTool.createColumn', {
              tableName: 'Orders',
              column: { name: 'remark', type: 'string', label: '备注' },
            }),
          ],
        }
      case 6:
        return {
          text: '',
          toolCalls: [
            makeToolCall('8', 'dataset.export', {}),
          ],
        }
      default:
        return {
          text: '已完成细粒度编辑并导出 pagedata.json。',
        }
    }
  }

  async appendMessages(_sessionId: string, messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>): Promise<void> {
    this.appendedMessages.push(messages)
  }

  async getConversation(): Promise<Array<{ role: string; content: string }>> {
    return []
  }

  async destroySession(): Promise<void> {
    return
  }

  async destroyAllSessions(): Promise<void> {
    return
  }
}

function makeToolCall(id: string, action: string, params: Record<string, unknown>): ToolCall {
  return {
    id,
    function: {
      name: actionToFunctionName(action),
      arguments: JSON.stringify(params),
    },
  }
}

describe('dataset fine edit orchestrator', () => {
  let session: IStillSession

  beforeEach(() => {
    clearDomains()
    clearRegistry()
    registerEditStills()
    session = createSession()
  })

  it('drives capability lookup, actionSpec lookup, self-heal retry, and dataset export through runStillsLoop', async () => {
    const init = executeStill('edit.init', {
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
    }, session, 'test-init')
    expect(init.ok).toBe(true)

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
    const backend = new ScriptedBackend()

    const result = await runStillsLoop(
      buildFineGrainedLoopUserPrompt('给订单表增加备注字段', context),
      session,
      backend,
      {
        maxRounds: 8,
        slidingWindow: 12,
        systemPrompt: buildFineGrainedLoopSystemPrompt(),
        monitors: [
          createRepeatDetectionMonitor({
            maxSameSignature: 2,
            maxConsecutiveErrors: 2,
          }),
        ],
      },
    )

    expect(result.aborted).toBe(false)
    expect(result.exportCompleted).toBe(true)
    expect(backend.systemPrompt).toContain('先自举')
    expect(backend.systemPrompt).toContain('必须自愈')
    expect(backend.systemPrompt).toContain('dataset.export')
    expect(backend.userPrompt).toContain('给订单表增加备注字段')
    expect(backend.userPrompt).toContain('Orders')

    const toolNames = backend.tools.map(tool => tool.function.name)
    expect(toolNames).toContain(actionToFunctionName('stills.capabilities'))
    expect(toolNames).toContain(actionToFunctionName('stills.actionSpec'))
    expect(toolNames).toContain(actionToFunctionName('datasetTool.createColumn'))
    expect(toolNames).toContain(actionToFunctionName('dataset.export'))

    const actions = result.turns
      .filter(turn => turn.phase === 'stills-execute' && turn.toolBlock)
      .map(turn => turn.toolBlock!.action)
    expect(actions).toEqual([
      'session.describe',
      'stills.capabilities',
      'stills.actionSpec',
      'stills.actionSpec',
      'datasetTool.createColumn',
      'stills.actionSpec',
      'datasetTool.createColumn',
      'dataset.export',
    ])

    const failureRound = backend.appendedMessages
      .flat()
      .find(message => message.role === 'tool' && message.tool_call_id === '5')
    expect(failureRound?.content).toContain('ok":false')
    expect(failureRound?.content).toContain('INVALID_PARAMS')

    const currentModel = executeStill('dataset.currentModel', {}, session, 'after-loop')
    expect(currentModel.ok).toBe(true)
    if (!currentModel.ok) return
    const tableNames = (currentModel.data as { tableNames: string[] }).tableNames
    expect(tableNames).toContain('Orders')

    const exported = executeStill('dataset.export', {}, session, 'after-export')
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    const pagedata = (exported.data as { file: { 'pagedata.json': string } }).file['pagedata.json']
    expect(pagedata).toContain('"remark"')
    expect(pagedata).toContain('"备注"')
  })
})