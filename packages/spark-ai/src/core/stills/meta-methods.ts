/**
 * Meta Methods — 会话描述与结构化反问
 *
 * 时序主线：
 * 1. core@session@describe 汇总当前 stills 会话状态；
 * 2. core@interaction@ask 在关键事实缺失时向用户发起结构化反问。
 *
 * 函数目录、函数指南、参数荷载目录和参数荷载指南由 core@knowledge 注册事实读模型提供。
 */

import type {
  IStillSession,
  SessionDomainState,
  StillDefinition,
  StillResult,
} from './types'
import { noGuard } from './types'
import { getDomain } from './domain'
import {
  buildExecutionTraceSummary,
  isNonEmptyString,
  missingParam,
} from './meta-common-utils'

const CORE_SESSION_MODULE_PROMPT = 'core@session 只做会话状态描述和下一步入口提示；不要把它当作业务编辑工具，缺少函数或参数事实时继续转向 core@knowledge。'
const CORE_INTERACTION_MODULE_PROMPT = 'core@interaction 只在关键事实缺失且无法通过只读查询确定时发起结构化反问；调用后停止写入并等待用户回答。'

interface DomainStateSummary {
  phase: string
  initialized: boolean
  roleHint?: string
}

interface InteractionAskOption {
  id: string
  label: string
  value?: unknown
  description?: string
}

interface InteractionAskQuestion {
  id: string
  prompt: string
  type: 'single' | 'multi'
  options: InteractionAskOption[]
  recommendedOptionIds: string[]
}

interface InteractionAskParams {
  title: string
  reason?: string
  questions: InteractionAskQuestion[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasDomainData(domainState: SessionDomainState<string>): boolean {
  return 'data' in domainState && domainState.data !== null
}

function buildDomainsSummary(session: IStillSession): {
  roles: string[]
  domainsSummary: Record<string, DomainStateSummary>
} {
  const roles: string[] = []
  const domainsSummary: Record<string, DomainStateSummary> = {}

  for (const [domainName, domainState] of Object.entries(session.domains)) {
    const domainDef = getDomain(domainName)
    if (domainDef?.roleHint) roles.push(domainDef.roleHint)

    domainsSummary[domainName] = {
      phase: domainState.phase,
      initialized: hasDomainData(domainState),
      ...(domainDef?.roleHint ? { roleHint: domainDef.roleHint } : {}),
    }
  }

  return { roles, domainsSummary }
}

function buildKnowledgeDiscoverySummary() {
  return {
    toolDiscovery: 'core@knowledge@queryTools({})',
    toolGuide: 'core@knowledge@guideTool({ action })',
    payloadDiscovery: 'core@knowledge@queryPayloads({})',
    payloadGuide: 'core@knowledge@guidePayload({ payloadRef, key })',
  }
}

function validateInteractionAskParams(params: unknown): string | null {
  if (!isRecord(params)) return 'core@interaction@ask 参数必须是对象'
  if (!isNonEmptyString(params['title'])) return missingParam('title')
  const rawQuestions = params['questions']
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return 'questions 必须是非空数组'

  for (const [questionIndex, question] of rawQuestions.entries()) {
    const prefix = `questions[${questionIndex}]`
    if (!isRecord(question)) return `${prefix} 必须是对象`
    const questionType = question['type']
    const rawOptions = question['options']
    const rawRecommendedOptionIds = question['recommendedOptionIds']
    if (!isNonEmptyString(question['id'])) return `${prefix}.id 必须是非空字符串`
    if (!isNonEmptyString(question['prompt'])) return `${prefix}.prompt 必须是非空字符串`
    if (questionType !== 'single' && questionType !== 'multi') return `${prefix}.type 必须是 single 或 multi`
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) return `${prefix}.options 至少提供 2 个备选项`
    if (!Array.isArray(rawRecommendedOptionIds) || rawRecommendedOptionIds.length === 0) return `${prefix}.recommendedOptionIds 必须提供推荐选项`
    if (questionType === 'single' && rawRecommendedOptionIds.length !== 1) return `${prefix}.recommendedOptionIds 单选题必须且只能推荐 1 个选项`

    const optionIds = new Set<string>()
    for (const [optionIndex, option] of rawOptions.entries()) {
      const optionPrefix = `${prefix}.options[${optionIndex}]`
      if (!isRecord(option)) return `${optionPrefix} 必须是对象`
      const optionId = option['id']
      if (!isNonEmptyString(optionId)) return `${optionPrefix}.id 必须是非空字符串`
      if (!isNonEmptyString(option['label'])) return `${optionPrefix}.label 必须是非空字符串`
      if (optionIds.has(optionId)) return `${prefix}.options 存在重复 id: ${optionId}`
      optionIds.add(optionId)
    }

    for (const recommendedId of rawRecommendedOptionIds) {
      if (!isNonEmptyString(recommendedId)) return `${prefix}.recommendedOptionIds 只能包含非空字符串`
      if (!optionIds.has(recommendedId)) return `${prefix}.recommendedOptionIds 包含不存在的选项: ${recommendedId}`
    }
  }

  return null
}

export const sessionDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'core@session@describe',
  type: 'describe',
  description: '会话全局监控：返回域状态、执行追踪和 knowledge 查询入口。',
  modulePrompt: CORE_SESSION_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '会话层只做状态聚合，不直接返回业务工具或参数荷载详情。',
    '函数目录请调用 core@knowledge@queryTools；函数参数指南请调用 core@knowledge@guideTool。',
    '参数荷载目录请调用 core@knowledge@queryPayloads；参数荷载指南请调用 core@knowledge@guidePayload。',
  ],
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const { roles, domainsSummary } = buildDomainsSummary(session)
    const executionTrace = buildExecutionTraceSummary(session)

    return {
      ok: true,
      data: {
        role: roles.length > 0 ? roles.join('；') : '通用 Stills 助手',
        domains: domainsSummary,
        executionTrace,
        knowledge: buildKnowledgeDiscoverySummary(),
        nextStep: 'core@knowledge@queryTools → 了解函数目录；core@knowledge@guideTool → 查询目标函数参数指南。',
      },
      summary: '返回会话全局状态与 knowledge 查询入口',
    }
  },
}

export const interactionAsk: StillDefinition<InteractionAskParams, InteractionAskParams> = {
  action: 'core@interaction@ask',
  type: 'describe',
  description: '向用户发起结构化反问；必须提供完整备选项与推荐选项。',
  modulePrompt: CORE_INTERACTION_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '仅当关键业务事实无法从当前上下文或只读动作判定时调用。',
    '每个问题必须提供完整备选项；如存在开放场景，应提供“其他/自定义”选项。',
    '每个问题必须提供 recommendedOptionIds；推荐项只能来自 options[].id。',
    '调用后停止继续写入或尝试，等待用户点击选项回答。',
  ],
  paramsSchema: {
    kind: 'object',
    properties: {
      title: 'string — 反问主题，简短说明本次需要确认什么',
      questions: {
        kind: 'array',
        note: '问题列表；为保证点击即回答，优先一次只问 1 个关键问题',
        items: {
          kind: 'object',
          properties: {
            id: 'string — 问题稳定 id，如 scope、layout、fields',
            prompt: 'string — 面向用户的问题文本',
            type: { kind: 'enum', enum: ['single', 'multi'], note: 'single=单选；multi=多选' },
            options: {
              kind: 'array',
              note: '完整备选项，至少 2 项；需要开放输入时提供 other/custom 选项',
              items: {
                kind: 'object',
                properties: {
                  id: 'string — 选项稳定 id',
                  label: 'string — 展示给用户的选项名称',
                },
                optional: {
                  value: 'string — 选项值；未提供时使用 id',
                  description: 'string? — 选项说明或适用场景',
                },
              },
            },
            recommendedOptionIds: {
              kind: 'array',
              note: '推荐选项 id；single 必须 1 个，multi 可多个',
              items: 'string — options[].id 中的值',
            },
          },
        },
      },
    },
    optional: {
      reason: 'string? — 为什么需要用户确认；写清缺失事实，不要泛泛描述',
    },
  },
  resultSchema: {
    title: 'string',
    reason: 'string?',
    questions: 'Array<{ id; prompt; type; options; recommendedOptionIds }>',
  },
  example: {
    title: '确认页面编辑范围',
    reason: '当前请求缺少关键业务事实，继续写入会影响组件结构选择。',
    questions: [
      {
        id: 'edit-scope',
        prompt: '本次优先调整哪个页面区域？',
        type: 'single',
        options: [
          { id: 'list', label: '列表区' },
          { id: 'form', label: '表单区' },
        ],
        recommendedOptionIds: ['list'],
      },
    ],
  },
  validate: validateInteractionAskParams,
  execute: (_session, params): StillResult<InteractionAskParams> => ({
    ok: true,
    data: params,
    summary: `等待用户回答反问：${params.title}（${params.questions.length} 题）`,
  }),
}