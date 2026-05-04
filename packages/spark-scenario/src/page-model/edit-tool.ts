import type { PageModelRequirements } from './contracts'
import { createPageModelFunction, pageModelToolFailure, type PageModelToolFamily } from './tool-contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' && field.trim() !== '' ? field : undefined
}

function readStringList(value: Record<string, unknown>, key: string): readonly string[] {
  const field = value[key]
  if (!Array.isArray(field)) return []
  return field.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function requirementsArg(args: unknown): PageModelRequirements {
  if (!isRecord(args)) throw new Error('参数必须是对象。')
  const summary = readString(args, 'summary')
  if (summary === undefined) throw new Error('缺少 summary（string）。')
  return {
    summary,
    constraints: readStringList(args, 'constraints'),
    assumptions: readStringList(args, 'assumptions'),
    confirmedAt: new Date().toISOString(),
  }
}

function readBoolean(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const field = value[key]
  return typeof field === 'boolean' ? field : fallback
}

function askArg(args: unknown) {
  if (!isRecord(args)) throw new Error('参数必须是对象。')
  const reason = readString(args, 'reason')
  if (reason === undefined) throw new Error('缺少 reason（string）。')
  const rawQuestions = args['questions']
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) throw new Error('questions 必须是非空数组。')
  const questions = rawQuestions.map((question, index) => {
    if (!isRecord(question)) throw new Error(`questions[${index}] 必须是对象。`)
    const id = readString(question, 'id')
    const prompt = readString(question, 'prompt')
    if (id === undefined) throw new Error(`缺少 questions[${index}].id（string）。`)
    if (prompt === undefined) throw new Error(`缺少 questions[${index}].prompt（string）。`)
    return {
      id,
      prompt,
      options: readStringList(question, 'options'),
      allowFreeform: readBoolean(question, 'allowFreeform', true),
    }
  })
  return { reason, questions }
}

export function createEditToolFamily(): PageModelToolFamily {
  return {
    name: 'edit',
    title: '编辑流程工具',
    description: '负责打开、审视、确认需求、校验和提交 PageModelHost。',
    rules: ['edit 是流程工具族，不直接表示 rule/pagedata/script/style 的领域操作。'],
    functions: [
      createPageModelFunction({
        action: 'edit.open',
        type: 'request',
        description: '绑定或创建当前 PageModelHost，并打开页面模型编辑流程。',
        paramsSchema: {},
        usageRules: ['任何页面模型写入前必须先调用。', 'host key 必须由上下文或 hostKey 参数提供。'],
        persistAfterExecute: 'always',
        execute: ({ host }) => {
          host.setFlowState({
            ...host.getFlowState(),
            opened: true,
            updatedAt: new Date().toISOString(),
          })
          return { opened: true, mode: host.mode, files: Object.keys(host.readAllFiles()) }
        },
      }),
      createPageModelFunction({
        action: 'edit.inspect',
        type: 'describe',
        description: '返回当前页面模型摘要、流程状态与已确认需求。',
        paramsSchema: {},
        usageRules: ['只读动作，不修改 4 文件。'],
        execute: ({ host }) => {
          const files = host.readAllFiles()
          return {
            mode: host.mode,
            flowState: host.getFlowState(),
            requirements: host.getRequirements(),
            files: {
              ruleLength: files['rule.json'].length,
              pageDataLength: files['pagedata.json'].length,
              scriptLength: files['script.js'].length,
              styleLength: files['style.css'].length,
            },
          }
        },
      }),
      createPageModelFunction({
        action: 'edit.ask',
        type: 'describe',
        description: '当用户意图不足时返回结构化反问，不修改 4 文件。',
        paramsSchema: {
          reason: 'string — 为什么当前信息不足以安全编辑页面模型',
          questions: {
            kind: 'array',
            items: {
              kind: 'object',
              required: ['id', 'prompt'],
              properties: {
                id: 'string — 问题 ID，用于后续需求确认引用',
                prompt: 'string — 面向用户的具体问题',
                options: { kind: 'array', items: 'string — 可选答案' },
                allowFreeform: 'boolean? — 是否允许用户自由输入，默认 true',
              },
            },
          },
        },
        usageRules: ['业务意图、组件规格、DataKey 或保存策略不明确时必须先反问。', 'edit.ask 只产生结构化问题，不写入 4 文件。'],
        execute: ({ args }) => {
          const ask = askArg(args)
          return { ask, requiresUserInput: true }
        },
      }),
      createPageModelFunction({
        action: 'edit.confirmRequirements',
        type: 'request',
        description: '确认并固化本轮具体业务需求和限制，写入 host 与框架 session store。',
        paramsSchema: {
          summary: 'string — 本轮已确认的具体业务目标摘要',
          constraints: { kind: 'array', items: 'string — 业务限制' },
          assumptions: { kind: 'array', items: 'string — 待跟踪假设' },
        },
        usageRules: ['意图不完整时应先通过反问或用户回复补足，再调用本函数。'],
        persistAfterExecute: 'always',
        execute: ({ host, args }) => {
          const requirements = requirementsArg(args)
          host.setRequirements(requirements)
          return { requirements }
        },
      }),
      createPageModelFunction({
        action: 'edit.validate',
        type: 'describe',
        description: '校验当前 4 文件模型、流程状态与业务需求确认状态。',
        paramsSchema: {},
        usageRules: ['headless commit 前必须调用。'],
        persistAfterExecute: 'always',
        execute: ({ host }) => {
          const validation = host.validate()
          host.setFlowState({
            ...host.getFlowState(),
            validated: validation.ok,
            lastValidation: validation,
            updatedAt: new Date().toISOString(),
          })
          if (!validation.ok) {
            return pageModelToolFailure({
              code: 'PAGE_MODEL_VALIDATE_FAILED',
              msg: validation.issues.map((issue) => issue.message).join('；'),
              fix: validation.issues.map((issue) => issue.fix).filter((item): item is string => item !== undefined).join('；'),
            })
          }
          return { validation }
        },
      }),
      createPageModelFunction({
        action: 'edit.commit',
        type: 'request',
        description: '提交当前页面模型；headless 模式执行事务式落盘，UI 模式只完成流程提交标记。',
        paramsSchema: {},
        usageRules: ['headless 模式必须在 run 结束前成功调用。', '必须在 edit.validate 通过后调用。'],
        persistAfterExecute: 'always',
        execute: async ({ host }) => {
          const result = await host.commit()
          if (!result.ok) {
            return pageModelToolFailure({
              code: 'PAGE_MODEL_COMMIT_FAILED',
              msg: result.error ?? '页面模型提交失败。',
              fix: '检查 edit.validate 输出和 headless 存储写入能力后重试。',
            })
          }
          return result
        },
      }),
      createPageModelFunction({
        action: 'edit.rollback',
        type: 'request',
        description: '回滚当前 PageModelHost 上尚未提交的 4 文件变更。',
        paramsSchema: {},
        usageRules: ['只回滚未提交的 4 文件内存态；不会写入存储。', 'rollback 后若 headless run 仍要求完成，必须重新 validate + commit。'],
        persistAfterExecute: 'always',
        execute: async ({ host }) => {
          if (host.rollback === undefined) {
            return pageModelToolFailure({
              code: 'PAGE_MODEL_ROLLBACK_UNSUPPORTED',
              msg: '当前 PageModelHost 未提供 rollback 能力。',
              fix: '使用支持 rollback 的 host，或重新打开 host 后再执行页面编辑流程。',
            })
          }
          await host.rollback()
          return { rolledBack: true, flowState: host.getFlowState() }
        },
      }),
    ],
  }
}
