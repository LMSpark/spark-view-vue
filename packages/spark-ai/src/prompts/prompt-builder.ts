// ── 系统提示词拼接器（前端 SSoT）─────────────────────────────────────────
//
// 当前模块作为提示词拼接的单一入口，统一承接页面生成与 stills 相关提示词组装。

import { PAGE_SYSTEM_PROMPT } from './page-system-prompt'
import { STILLS_RUNTIME_PROMPT, STILLS_BLUEPRINT_PROMPT } from './stills-prompts'

// ─────────────────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────────────────

/** 提示词拼接上下文 */
export interface PromptBuildContext {
  /** 用户输入的 prompt 文本 */
  prompt?: string
  /** 迭代反馈文本 */
  feedback?: string
  /** 当前文件内容 Map（如 rule.json → 内容字符串） */
  currentFiles?: Record<string, string>
  /** 日志条目 */
  logs?: Array<{ message?: string; componentType?: string; meta?: string }>
}

/** 组件元数据服务抽象（对应 Java 端 ComponentMetadataService 子集） */
export interface ISkillMetadataProvider {
  /** 返回 skill 索引提示词（按类型分组的摘要），无数据则返回 null */
  getSkillPromptIndex(): string | null
  /** 根据相关 skill 类型返回详细提示词 */
  getSkillPromptForTypes(types: string[]): string | null
  /** 返回紧凑版全量 skill 提示词 */
  getSkillPromptCompact(): string | null
}

/** 页面生成提示词拼接选项 */
export interface BuildPagePromptOptions {
  /** 拼接上下文（用户输入 + 反馈 + 文件 + 日志） */
  context?: PromptBuildContext
  /** 组件元数据服务（可选，提供 skill catalog） */
  metadataProvider?: ISkillMetadataProvider
}

/** 提示词模式 */
export type PromptMode = 'page' | 'stills' | 'stills-blueprint'

// ─────────────────────────────────────────────────────────────────────────────
// Skill 类型关键词检测
// ─────────────────────────────────────────────────────────────────────────────

/** skill 类型 → 关键词列表 */
const SKILL_KEYWORDS: Record<string, string[]> = {
  'r-tree': [
    'r-tree', '树容器', '树形', '树节点', 'nodeclick', 'node-click',
    'lazy', '懒加载', 'treetable', '树表', 'treemanager',
    '组织架构', '目录树', '分类树',
  ],
  'r-form': [
    'r-form', '表单容器', '双向编辑', 'context_data', 'contextdata',
    '编辑表单', '录入表单', '新增表单', '修改表单',
  ],
  'r-detail': [
    'r-detail', '详情容器', '只读详情', '信息面板',
    '查看详情', '详情展示',
  ],
  'r-table': [
    'r-table', '表格容器', 'datakey', '数据绑定表格',
    '列表页', '数据表格', '主从表',
  ],
}

/**
 * 从上下文中检测相关的 skill 类型。
 */
export function detectRelevantSkillTypes(context?: PromptBuildContext): string[] {
  const text = collectSkillDetectionContext(context).toLowerCase()
  if (text.length === 0) return []

  const result: string[] = []
  for (const [skillType, keywords] of Object.entries(SKILL_KEYWORDS)) {
    if (containsAny(text, keywords)) {
      result.push(skillType)
    }
  }
  return result
}

/**
 * 拼接 skill 检测上下文文本。
 */
function collectSkillDetectionContext(context?: PromptBuildContext): string {
  if (!context) return ''

  const parts: string[] = []

  if (context.prompt) parts.push(context.prompt)
  if (context.feedback) parts.push(context.feedback)

  if (context.currentFiles) {
    for (const content of Object.values(context.currentFiles)) {
      if (content) parts.push(content)
    }
  }

  if (context.logs) {
    for (const log of context.logs) {
      if (log.message) parts.push(log.message)
      if (log.componentType) parts.push(log.componentType)
      if (log.meta) parts.push(log.meta)
    }
  }

  return parts.join(' ')
}

/** 多关键词匹配。 */
function containsAny(text: string, needles: string[]): boolean {
  return needles.some(n => text.includes(n.toLowerCase()))
}

// ─────────────────────────────────────────────────────────────────────────────
// 提示词拼接
// ─────────────────────────────────────────────────────────────────────────────

/** 追加提示词分节（双换行分隔） */
function appendSection(base: string, section: string): string {
  return `${base}\n\n${section}`
}

/**
 * 拼接页面生成系统提示词。
 * 当前逻辑分三层优先级：
 *
 * 1. metadataProvider.getSkillPromptIndex() + detectRelevantSkillTypes → getSkillPromptForTypes
 * 2. metadataProvider.getSkillPromptCompact()
 */
export function buildPageSystemPrompt(options?: BuildPagePromptOptions): string {
  let prompt = PAGE_SYSTEM_PROMPT
  const provider = options?.metadataProvider

  // 优先级 1：服务端 Skill Index + 定向 Skill 详情
  if (provider) {
    const indexPrompt = provider.getSkillPromptIndex()
    if (indexPrompt) {
      prompt = appendSection(prompt, indexPrompt)
      const relevantTypes = detectRelevantSkillTypes(options.context)
      const relevantPrompt = provider.getSkillPromptForTypes(relevantTypes)
      if (relevantPrompt) {
        prompt = appendSection(prompt, relevantPrompt)
      }
      return prompt
    }

    // 优先级 2：紧凑版全量 Skill Prompt
    const compactPrompt = provider.getSkillPromptCompact()
    if (compactPrompt) {
      return appendSection(prompt, compactPrompt)
    }
  }

  return prompt
}

/**
 * 根据模式返回对应的系统提示词。
 * 统一入口，供 ai-loop 等消费方使用。
 */
export function getSystemPrompt(mode: PromptMode, options?: BuildPagePromptOptions): string {
  switch (mode) {
    case 'page':
      return buildPageSystemPrompt(options)
    case 'stills':
      return STILLS_RUNTIME_PROMPT
    case 'stills-blueprint':
      return STILLS_BLUEPRINT_PROMPT
    default:
      return buildPageSystemPrompt(options)
  }
}
