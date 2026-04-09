/**
 * Generate Orchestrator — 三阶段 FC 生成编排器。
 *
 * 三阶段流程：
 *   Phase 1: pagedata.json（数据模型，emitPagedata）
 *   Phase 2: rule.json + script.js（UI + 交互，emitRuleJson + emitScriptJs）
 *   Phase 3: style.css（样式，emitStyleCss）
 *
 * 每阶段内循环：query* → emit* → tool-layer 校验 → 语义校验 → pass / iterate
 * 阶段间：语义校验失败可回溯上一阶段（maxBacktracks=1）
 *
 * @module generate-orchestrator
 */

import type { ComponentCatalog } from '../catalog/types'
import type { SessionBackend } from '../runtime/session-orchestrator'
import type { ToolDefinition } from '../tool-calling'
import {
  GENERATE_BASE_PROMPT,
  DATA_PHASE_PROMPT,
  UI_PHASE_PROMPT,
  STYLE_PHASE_PROMPT,
  CROSS_CONSISTENCY_PROMPT,
} from '../prompts/page-system-prompt'
import {
  getGenerateToolsForApi,
  dispatchQueryTool,
  type Phase,
  type GenerateToolName,
} from './generate-tools-catalog'
import type {
  GenerateArtifacts,
  ToolLayerValidationResult,
} from './generate-validators'
import {
  validateToolLayerEmit,
  validateSemanticCrossPhase,
} from './generate-validators'

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface GenerateConfig {
  /** 用户需求描述 */
  userPrompt: string
  /** 组件目录（查询型 tool 需要） */
  catalog: ComponentCatalog | null
  /** 每阶段最大循环轮次（默认 5） */
  maxRoundsPerPhase?: number
  /** 最大回溯次数（默认 1） */
  maxBacktracks?: number
  /** 滑动窗口大小（默认 30） */
  slidingWindow?: number
  /** 进度回调 */
  onProgress?: (event: GenerateProgressEvent) => void
}

export type GenerateProgressEvent =
  | { type: 'phase-start'; phase: Phase; phaseIndex: number }
  | { type: 'round-start'; phase: Phase; round: number }
  | { type: 'tool-call'; phase: Phase; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; phase: Phase; toolName: string; ok: boolean }
  | { type: 'validation'; phase: Phase; layer: 'tool' | 'semantic'; passed: boolean; issues: string[] }
  | { type: 'backtrack'; from: Phase; to: Phase; reason: string }
  | { type: 'phase-complete'; phase: Phase }
  | { type: 'complete'; artifacts: GenerateArtifacts }
  | { type: 'error'; message: string }

export interface GenerateResult {
  success: boolean
  artifacts: GenerateArtifacts
  totalRounds: number
  phaseSummary: Array<{
    phase: Phase
    rounds: number
    backtracks: number
  }>
  sessionId: string
  error?: string
}

// ═══════════════════════════════════════════════════════════
// Phase Config
// ═══════════════════════════════════════════════════════════

const PHASES = [
  {
    phase: 'data' as const,
    prompt: DATA_PHASE_PROMPT,
    emitTools: ['emitPagedata'] as GenerateToolName[],
  },
  {
    phase: 'ui' as const,
    prompt: UI_PHASE_PROMPT,
    emitTools: ['emitRuleJson', 'emitScriptJs'] as GenerateToolName[],
  },
  {
    phase: 'style' as const,
    prompt: STYLE_PHASE_PROMPT,
    emitTools: ['emitStyleCss'] as GenerateToolName[],
  },
]

// ═══════════════════════════════════════════════════════════
// Emit handler — 处理生成型 tool call
// ═══════════════════════════════════════════════════════════

function isEmitTool(name: string): name is 'emitPagedata' | 'emitRuleJson' | 'emitScriptJs' | 'emitStyleCss' {
  return name.startsWith('emit')
}

function handleEmitTool(
  toolName: GenerateToolName,
  args: Record<string, unknown>,
  artifacts: GenerateArtifacts,
): { success: boolean; content: string; validation: ToolLayerValidationResult | null } {
  const content = args['content']

  // Tool-layer validation
  const validation = validateToolLayerEmit(toolName, content)
  if (!validation.passed) {
    return {
      success: false,
      content: JSON.stringify({
        error: 'tool-layer validation failed',
        issues: validation.issues,
      }),
      validation,
    }
  }

  // Store artifact
  if (toolName === 'emitPagedata') {
    artifacts.pagedata = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  } else if (toolName === 'emitRuleJson') {
    artifacts.ruleJson = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  } else if (toolName === 'emitScriptJs') {
    artifacts.scriptJs = content as string
  } else if (toolName === 'emitStyleCss') {
    artifacts.styleCss = content as string
  }

  return {
    success: true,
    content: JSON.stringify({ success: true, message: `${toolName} accepted` }),
    validation,
  }
}

// ═══════════════════════════════════════════════════════════
// Core Loop
// ═══════════════════════════════════════════════════════════

/**
 * 运行三阶段 FC 生成循环。
 *
 * @param backend - 后端会话客户端
 * @param config  - 生成配置
 */
export async function runGenerateLoop(
  backend: SessionBackend,
  config: GenerateConfig,
): Promise<GenerateResult> {
  const {
    userPrompt,
    catalog,
    maxRoundsPerPhase = 5,
    maxBacktracks = 1,
    slidingWindow = 30,
    onProgress,
  } = config

  const artifacts: GenerateArtifacts = {}
  const phaseSummary: GenerateResult['phaseSummary'] = []
  let totalRounds = 0
  let sessionId = ''

  try {
    // ── 创建后端会话 ──
    const systemPrompt = GENERATE_BASE_PROMPT
    const tools = getGenerateToolsForApi()

    sessionId = await backend.createSession(
      systemPrompt,
      userPrompt,
      slidingWindow,
      tools as unknown as ToolDefinition[],
    )

    // ── 三阶段循环 ──
    let backtracksUsed = 0

    for (let phaseIndex = 0; phaseIndex < PHASES.length; phaseIndex++) {
      const phaseConfig = PHASES[phaseIndex]
      if (!phaseConfig) break
      const { phase, prompt, emitTools } = phaseConfig

      onProgress?.({ type: 'phase-start', phase, phaseIndex })

      // 注入阶段 prompt
      if (phaseIndex > 0) {
        await backend.appendMessages(sessionId, [{
          role: 'user',
          content: `切换到下一阶段。\n\n${prompt}`,
        }])
      } else {
        // Phase 1: 阶段 prompt 已在 system prompt 后追加
        await backend.appendMessages(sessionId, [{
          role: 'user',
          content: prompt,
        }])
      }

      let phaseRounds = 0
      let phaseBacktracks = 0
      let phaseComplete = false

      while (phaseRounds < maxRoundsPerPhase && !phaseComplete) {
        phaseRounds++
        totalRounds++
        onProgress?.({ type: 'round-start', phase, round: phaseRounds })

        // ── Step 1: ExecuteTurn ──
        const llmResponse = await backend.executeTurn(sessionId)
        if (llmResponse === null) {
          onProgress?.({ type: 'error', message: 'LLM 调用失败' })
          return buildResult(false, artifacts, totalRounds, phaseSummary, sessionId, 'LLM 调用失败')
        }

        const { toolCalls } = llmResponse

        // 无 tool call → 阶段结束（LLM 认为已完成或需要更多信息）
        if (!toolCalls || toolCalls.length === 0) {
          // 检查是否有必要产物
          if (hasRequiredArtifacts(emitTools, artifacts)) {
            phaseComplete = true
          }
          break
        }

        // ── Step 2: 处理 tool calls ──
        // Note: executeTurn 已在后端将 assistant(tool_calls) 追加到会话历史，
        // 这里只追加 tool result 消息，避免 assistant 消息重复导致 OpenAI 400 错误。
        const messages: Array<{ role: string; content: string; tool_call_id?: string }> = []

        for (const tc of toolCalls) {
          const toolName = tc.function.name as GenerateToolName
          let args: Record<string, unknown>
          try {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>
          } catch {
            args = {}
          }

          onProgress?.({ type: 'tool-call', phase, toolName, args })

          let resultContent: string

          if (!isEmitTool(toolName)) {
            // 查询型 → 分发到知识库
            resultContent = dispatchQueryTool(toolName, args, catalog)
            onProgress?.({ type: 'tool-result', phase, toolName, ok: true })
          } else {
            // 生成型 → tool-layer 校验 + 存储
            const emitResult = handleEmitTool(toolName, args, artifacts)
            resultContent = emitResult.content
            onProgress?.({ type: 'tool-result', phase, toolName, ok: emitResult.success })

            if (emitResult.validation && !emitResult.validation.passed) {
              onProgress?.({
                type: 'validation',
                phase,
                layer: 'tool',
                passed: false,
                issues: emitResult.validation.issues,
              })
            }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: resultContent,
          })
        }

        // ── Step 3: 追加消息到后端 ──
        await backend.appendMessages(sessionId, messages)

        // ── Step 4: 检查阶段产物是否齐全 ──
        if (hasRequiredArtifacts(emitTools, artifacts)) {
          // ── Step 5: 语义校验 ──
          const semanticResult = validateSemanticCrossPhase(artifacts, phase)
          onProgress?.({
            type: 'validation',
            phase,
            layer: 'semantic',
            passed: semanticResult.passed,
            issues: semanticResult.issues,
          })

          if (semanticResult.passed) {
            phaseComplete = true
          } else {
            // 需要回溯？
            if (semanticResult.requiresBacktrack && phaseIndex > 0 && backtracksUsed < maxBacktracks) {
              backtracksUsed++
              phaseBacktracks++
              const prevPhaseConfig = PHASES[phaseIndex - 1]
              if (!prevPhaseConfig) break
              const prevPhase = prevPhaseConfig.phase
              onProgress?.({
                type: 'backtrack',
                from: phase,
                to: prevPhase,
                reason: semanticResult.issues.join('; '),
              })

              // 注入回溯指令
              await backend.appendMessages(sessionId, [{
                role: 'user',
                content: `${CROSS_CONSISTENCY_PROMPT}\n\n检测到交叉一致性问题，需要回溯修正：\n${semanticResult.issues.map(i => `- ${i}`).join('\n')}\n\n请重新生成 ${prevPhase} 阶段的产物。`,
              }])

              // 回退 phaseIndex（下一次循环回到上一阶段）
              phaseIndex--
              break
            } else {
              // 注入错误信息让 LLM 修正
              await backend.appendMessages(sessionId, [{
                role: 'user',
                content: `${CROSS_CONSISTENCY_PROMPT}\n\n语义校验失败：\n${semanticResult.issues.map(i => `- ${i}`).join('\n')}\n\n请修正后重新提交。`,
              }])
            }
          }
        }
      }

      // ── 阶段轮次耗尽但产物未齐 → 追加 nudge 让 LLM emit ──
      if (!phaseComplete && !hasRequiredArtifacts(emitTools, artifacts)) {
        // nudge 预算按缺失工具数动态计算（每个工具至少 2 轮容错）
        const initialMissing = emitTools.filter(t => {
          if (t === 'emitPagedata') return !artifacts.pagedata
          if (t === 'emitRuleJson') return !artifacts.ruleJson
          if (t === 'emitScriptJs') return !artifacts.scriptJs
          if (t === 'emitStyleCss') return artifacts.styleCss === undefined
          return false
        })
        const maxNudgeRounds = Math.max(2, initialMissing.length * 2)
        for (let nudge = 0; nudge < maxNudgeRounds && !hasRequiredArtifacts(emitTools, artifacts); nudge++) {
          const missingTools = emitTools.filter(t => {
            if (t === 'emitPagedata') return !artifacts.pagedata
            if (t === 'emitRuleJson') return !artifacts.ruleJson
            if (t === 'emitScriptJs') return !artifacts.scriptJs
            if (t === 'emitStyleCss') return artifacts.styleCss === undefined
            return false
          })
          if (missingTools.length === 0) break

          await backend.appendMessages(sessionId, [{
            role: 'user',
            content: missingTools.length === 1
              ? `当前阶段轮次即将耗尽，请立即调用 ${missingTools[0]} 提交产物。不要再查询，直接根据已有信息生成并提交。`
              : `当前阶段轮次即将耗尽，还需要提交 ${missingTools.length} 个产物。请在本轮**同时**调用：${missingTools.join(' 和 ')}。每个 tool 都必须调用，不可省略。`,
          }])

          const nudgeResponse = await backend.executeTurn(sessionId)
          if (!nudgeResponse?.toolCalls?.length) break

          totalRounds++
          const nudgeMessages: Array<{ role: string; content: string; tool_call_id?: string }> = []
          for (const tc of nudgeResponse.toolCalls) {
            const toolName = tc.function.name as GenerateToolName
            let args: Record<string, unknown>
            try {
              args = JSON.parse(tc.function.arguments) as Record<string, unknown>
            } catch { args = {} }
            onProgress?.({ type: 'tool-call', phase, toolName, args })

            let resultContent: string
            if (isEmitTool(toolName)) {
              const emitResult = handleEmitTool(toolName, args, artifacts)
              resultContent = emitResult.content
              onProgress?.({ type: 'tool-result', phase, toolName, ok: emitResult.success })
            } else {
              resultContent = dispatchQueryTool(toolName, args, catalog)
              onProgress?.({ type: 'tool-result', phase, toolName, ok: true })
            }
            nudgeMessages.push({ role: 'tool', tool_call_id: tc.id, content: resultContent })
          }
          await backend.appendMessages(sessionId, nudgeMessages)
        }

        if (hasRequiredArtifacts(emitTools, artifacts)) {
          const semanticResult = validateSemanticCrossPhase(artifacts, phase)
          if (semanticResult.passed) phaseComplete = true
        }
      }

      phaseSummary.push({
        phase,
        rounds: phaseRounds,
        backtracks: phaseBacktracks,
      })

      if (phaseComplete) {
        onProgress?.({ type: 'phase-complete', phase })
      } else {
        // 阶段未完成 → fail-fast，不继续后续阶段
        const missing = emitTools.filter(t => {
          if (t === 'emitPagedata') return !artifacts.pagedata
          if (t === 'emitRuleJson') return !artifacts.ruleJson
          if (t === 'emitScriptJs') return !artifacts.scriptJs
          if (t === 'emitStyleCss') return artifacts.styleCss === undefined
          return false
        })
        const errMsg = `Phase ${phase} 未能产出所有必需文件: ${missing.join(', ')}`
        onProgress?.({ type: 'error', message: errMsg })
        return buildResult(false, artifacts, totalRounds, phaseSummary, sessionId, errMsg)
      }
    }

    onProgress?.({ type: 'complete', artifacts })
    return buildResult(true, artifacts, totalRounds, phaseSummary, sessionId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onProgress?.({ type: 'error', message })
    return buildResult(false, artifacts, totalRounds, phaseSummary, sessionId, message)
  }
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function hasRequiredArtifacts(
  emitTools: GenerateToolName[],
  artifacts: GenerateArtifacts,
): boolean {
  for (const tool of emitTools) {
    if (tool === 'emitPagedata') {
      if (!artifacts.pagedata) return false
    } else if (tool === 'emitRuleJson') {
      if (!artifacts.ruleJson) return false
    } else if (tool === 'emitScriptJs') {
      if (!artifacts.scriptJs) return false
    } else if (tool === 'emitStyleCss') {
      if (artifacts.styleCss === undefined) return false
    }
  }
  return true
}

function buildResult(
  success: boolean,
  artifacts: GenerateArtifacts,
  totalRounds: number,
  phaseSummary: GenerateResult['phaseSummary'],
  sessionId: string,
  error?: string,
): GenerateResult {
  return {
    success,
    artifacts,
    totalRounds,
    phaseSummary,
    sessionId,
    ...(error !== undefined ? { error } : {}),
  }
}
