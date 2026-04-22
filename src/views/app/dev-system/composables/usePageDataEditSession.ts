import { ref, onUnmounted } from 'vue'
import {
  getEditState,
  runStillsLoop,
  configureSessionBackend,
  createRepeatDetectionMonitor,
  generateToolDefinitions,
  type IStillSession,
  type DialogueTurn,
} from '@spark-view/spark-ai'
import type { IDataSetMetadata } from '@spark-view/spark-data'
import { createAuthHeaders } from '@/services/http'
import type { AiChatSender, AiChatSendRequest } from '@/composables/useAiChat'
import {
  buildFineGrainedEditContext,
  buildFineGrainedLoopSystemPrompt,
  buildFineGrainedLoopUserPrompt,
  summarizeFineGrainedTurns,
} from '../datasetFineEditOrchestration'
import type { PageDataAiRuntime, PageDataAiTaskStep, PageEditModel } from '../useDevState'
import { usePageModelSessionHost } from './usePageModelSessionHost'
import type { PageModelSessionHost } from './usePageModelSessionHost'

type StillsSession = IStillSession
type StreamHooks = Pick<AiChatSendRequest, 'onDelta' | 'onReasoning'>

interface UsePageDataEditSessionOptions {
  getContextModel: () => PageEditModel
  getPageId: () => string
  sessionHost?: PageModelSessionHost
  ensureContextLoaded?: () => Promise<void>
  onApplyPageData: (pageDataJson: IDataSetMetadata, options?: { source?: 'ai' }) => void
  onStatus: (msg: string, type: 'success' | 'warning' | 'error') => void
}

const AI_STREAM_PREFIX = 'AI: '
const REASONING_STREAM_PREFIX = '思考: '

export function usePageDataEditSession(options: UsePageDataEditSessionOptions) {
  const { getContextModel, getPageId, ensureContextLoaded, onApplyPageData, onStatus } = options
  const ownsSessionHost = options.sessionHost === undefined

  const sessionHost = options.sessionHost ?? usePageModelSessionHost({
    getContextModel,
    bootstrapTag: 'dataset-fine-edit-bootstrap',
    buildContextSignature(model) {
      return JSON.stringify({
        pageId: getPageId(),
        ruleJson: model.ruleJson,
        pageDataJson: model.pageDataJson,
        scriptJs: model.scriptJs,
        styleCss: model.styleCss,
      })
    },
  })

  const busy = ref(false)
  const taskSteps = ref<PageDataAiTaskStep[]>([])
  const sseLines = ref<string[]>([])
  let nextTaskStepId = 1
  const pendingTaskStepIds: string[] = []
  let streamHooks: StreamHooks | null = null

  const runtime: PageDataAiRuntime = {
    taskSteps,
    sseLines,
  }

  function resetRuntimeIndicators() {
    sseLines.value = []
    taskSteps.value = []
    pendingTaskStepIds.splice(0, pendingTaskStepIds.length)
    nextTaskStepId = 1
  }

  function truncateContextText(content: string, limit = 1200): string {
    if (content.length <= limit) return content
    return `${content.slice(0, limit)}\n...<truncated>`
  }

  function enqueueTaskSteps(actions: string[]) {
    const normalizedActions = actions.filter(action => action.trim().length > 0)
    if (normalizedActions.length === 0) return

    const shouldStartRunning = pendingTaskStepIds.length === 0
    const queuedSteps = normalizedActions.map((action, index) => ({
      id: `pagedata-task-${nextTaskStepId++}`,
      action,
      status: (shouldStartRunning && index === 0 ? 'running' : 'pending') as PageDataAiTaskStep['status'],
    }))

    taskSteps.value.push(...queuedSteps)
    pendingTaskStepIds.push(...queuedSteps.map(step => step.id))
  }

  function markTaskStepDone(action: string) {
    const currentStepId = pendingTaskStepIds.shift()
    if (!currentStepId) return

    const currentStep = taskSteps.value.find(step => step.id === currentStepId)
    if (currentStep) {
      currentStep.status = 'done'
      if (!currentStep.action) {
        currentStep.action = action
      }
    }

    const nextStepId = pendingTaskStepIds[0]
    if (!nextStepId) return

    const nextStep = taskSteps.value.find(step => step.id === nextStepId)
    if (nextStep?.status === 'pending') {
      nextStep.status = 'running'
    }
  }

  function pushSseLine(line: string) {
    if (!line.trim()) return
    sseLines.value.push(line)
    if (sseLines.value.length > 120) {
      sseLines.value.splice(0, sseLines.value.length - 120)
    }
  }

  function upsertStreamingLine(prefix: string, chunk: string) {
    if (!chunk) return
    const lastIdx = sseLines.value.length - 1
    const lastLine = lastIdx >= 0 ? sseLines.value[lastIdx] : undefined
    if (lastLine?.startsWith(prefix) === true) {
      sseLines.value[lastIdx] = lastLine + chunk
      return
    }
    pushSseLine(`${prefix}${chunk}`)
  }

  function closeStreamingLines() {
    const lastIdx = sseLines.value.length - 1
    if (lastIdx < 0) return
    const lastLine = sseLines.value[lastIdx]
    if (lastLine?.startsWith(AI_STREAM_PREFIX) === true || lastLine?.startsWith(REASONING_STREAM_PREFIX) === true) {
      sseLines.value[lastIdx] = lastLine.trimEnd()
    }
  }

  function onSseEvent(event: { sessionId: string; type: string; data: string }) {
    if (event.type === 'delta') {
      upsertStreamingLine(AI_STREAM_PREFIX, event.data)
      streamHooks?.onDelta?.(event.data)
      return
    }

    if (event.type === 'reasoning') {
      upsertStreamingLine(REASONING_STREAM_PREFIX, event.data)
      streamHooks?.onReasoning?.(event.data)
      return
    }

    if (event.type === 'result') {
      closeStreamingLines()
      try {
        const parsed = JSON.parse(event.data) as {
          text?: string
          toolCalls?: Array<{ function?: { name?: string } }>
        }
        if (parsed.text?.trim()) {
          pushSseLine(`结果: ${parsed.text}`)
        }
        if (Array.isArray(parsed.toolCalls) && parsed.toolCalls.length > 0) {
          const actionList = parsed.toolCalls
            .map(tc => tc.function?.name)
            .filter((name): name is string => Boolean(name && name.length > 0))
          if (actionList.length > 0) {
            enqueueTaskSteps(actionList)
            pushSseLine(`工具调用: ${actionList.join(', ')}`)
          }
        }
      } catch {
        pushSseLine(`结果(raw): ${event.data}`)
      }
      return
    }

    if (event.type === 'error') {
      closeStreamingLines()
      pushSseLine(`错误: ${event.data}`)
    }
  }

  function handleTurnComplete(turn: DialogueTurn) {
    if (turn.phase !== 'stills-execute' || !turn.toolBlock || !turn.stillsResult) return
    const { action, id } = turn.toolBlock
    const result = turn.stillsResult

    markTaskStepDone(action)

    if (result.ok) {
      const warningCount = result.warnings?.length ?? 0
      if (warningCount > 0) {
        pushSseLine(`[Round ${turn.round}] 执行 ${action}(${id}) -> 成功，warnings=${warningCount}`)
        for (const warning of result.warnings ?? []) {
          pushSseLine(`  - warning[${warning.rule}]: ${warning.detail}${warning.fix ? ` | fix: ${warning.fix}` : ''}`)
        }
      } else {
        pushSseLine(`[Round ${turn.round}] 执行 ${action}(${id}) -> 成功`)
      }
      return
    }

    pushSseLine(
      `[Round ${turn.round}] 执行 ${action}(${id}) -> 失败`
      + `${result.code ? ` | code=${result.code}` : ''}`
      + `${result.msg ? ` | msg=${result.msg}` : ''}`
      + `${result.fix ? ` | fix=${result.fix}` : ''}`,
    )
  }

  function buildFailureDetails(turns: DialogueTurn[]): string {
    const executedActions = turns.flatMap((turn) => {
      if (turn.phase !== 'stills-execute' || turn.toolBlock === undefined) return []
      return [turn.toolBlock.action]
    })

    const lastFailure = [...turns]
      .reverse()
      .find(turn => turn.phase === 'stills-execute' && turn.stillsResult && !turn.stillsResult.ok)

    const actionSummary = executedActions.length > 0
      ? executedActions.join(' -> ')
      : '（未记录到工具执行）'

    const failedResult = lastFailure?.stillsResult
    if (failedResult === undefined) {
      return `已执行动作链：${actionSummary}`
    }

    const failedAction = lastFailure?.toolBlock?.action ?? 'unknown'
    return `已执行动作链：${actionSummary}\n最后失败点：${failedAction}`
      + `${failedResult.code ? ` | code=${failedResult.code}` : ''}`
      + `${failedResult.msg ? ` | msg=${failedResult.msg}` : ''}`
      + `${failedResult.fix ? ` | fix=${failedResult.fix}` : ''}`
  }

  function ensureSession(): StillsSession {
    return sessionHost.ensureSession().session
  }

  async function runLlm(prompt: string, hooks?: StreamHooks): Promise<string> {
    if (!prompt.trim()) return ''

    busy.value = true
    resetRuntimeIndicators()
    streamHooks = hooks ?? null
    let lastTurns: DialogueTurn[] = []

    try {
      await ensureContextLoaded?.()
      const baselineModel = getContextModel()
      if (sessionHost.hasContextMismatch(baselineModel)) {
        await sessionHost.reset()
      }

      const contextSummary = buildFineGrainedEditContext(baselineModel.pageDataJson, {
        ruleNodeCount: baselineModel.ruleJson.length,
        scriptJsPreview: truncateContextText(baselineModel.scriptJs),
        styleCssPreview: truncateContextText(baselineModel.styleCss),
      })

      configureSessionBackend({
        getHeaders: createAuthHeaders,
        onSseEvent,
      })

      const currentSession = ensureSession()
      const result = await runStillsLoop(
        buildFineGrainedLoopUserPrompt(prompt, contextSummary),
        currentSession,
        sessionHost.backend,
        {
          maxRounds: 8,
          slidingWindow: 12,
          systemPrompt: buildFineGrainedLoopSystemPrompt(),
          ...sessionHost.getResumeSessionOptions(),
          tools: generateToolDefinitions({ compactDescriptions: true }),
          monitors: [
            {
              name: 'bootstrap-guard',
              afterStillExecution(ctx) {
                const action = ctx.currentTurn.toolBlock?.action ?? ''
                const bootstrapActions = new Set(['session.describe', 'stills.capabilities'])
                if (!bootstrapActions.has(action)) return []

                const count = ctx.allTurns.filter(turn => turn.toolBlock?.action === action).length
                if (count <= 1) return []

                return [
                  `[流程约束] ${action} 已重复 ${count} 次。请停止重复能力探测，直接执行 datasetTool.* 完成模型修改。`,
                ]
              },
            },
            createRepeatDetectionMonitor({
              maxSameSignature: 2,
              maxConsecutiveErrors: 2,
            }),
          ],
          onTurnComplete(turn) {
            handleTurnComplete(turn)
          },
        },
      )

      sessionHost.setBackendSessionId(result.sessionId)
      lastTurns = result.turns

      if (result.aborted) {
        throw new Error(`${result.abortReason ?? 'DataSet 模型编排被中止'}\n${buildFailureDetails(result.turns)}`)
      }

      const nextPageData = getEditState(currentSession).datasetEdit?.toJson()
      if (!nextPageData) {
        throw new Error('DataSet 模型会话未生成可导出的 pagedata 模型')
      }

      onApplyPageData(nextPageData, { source: 'ai' })
      sessionHost.syncContext(getContextModel())

      const tableCount = Object.keys(nextPageData.tables).length
      const relationCount = nextPageData.tableRelations?.length ?? 0
      const summary = `${summarizeFineGrainedTurns(result.turns)}\n\n当前 ${tableCount} 个表、${relationCount} 个关联。`
      onStatus(`✅ DataSet 模型级编辑完成 (${result.rounds} 轮)`, 'success')
      return summary
    } catch (error) {
      if (lastTurns.length > 0) {
        pushSseLine('--- 失败定位摘要 ---')
        pushSseLine(buildFailureDetails(lastTurns))
      }
      const message = error instanceof Error ? error.message : String(error)
      onStatus(`AI 操作失败: ${message}`, 'error')
      return `DataSet 模型编辑失败: ${message}`
    } finally {
      streamHooks = null
      configureSessionBackend({ getHeaders: createAuthHeaders })
      busy.value = false
    }
  }

  const sender: AiChatSender = async (request) => {
    const latestUserMessage = [...request.historyMsgs]
      .reverse()
      .find(message => message.role === 'user')

    const prompt = latestUserMessage?.content.trim() ?? ''
    if (!prompt) return

    request.onDelta?.('已接收需求，正在执行 DataSet 模型级编辑...\n')

    const result = await runLlm(prompt, {
      onDelta(delta) {
        request.onDelta?.(delta)
      },
      onReasoning(reasoning) {
        request.onReasoning?.(reasoning)
      },
    })

    if (result.startsWith('DataSet 模型编辑失败:')) {
      throw new Error(result)
    }

    request.onDelta?.(`\n\n${result}`)
  }

  function reset() {
    resetRuntimeIndicators()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
  }

  onUnmounted(() => {
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
  })

  return {
    busy,
    runtime,
    runLlm,
    sender,
    reset,
  }
}