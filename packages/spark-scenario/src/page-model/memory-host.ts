import type {
  PageModelCommitResult,
  PageModelFileName,
  PageModelFileTexts,
  PageModelFlowState,
  PageModelHost,
  PageModelHostKey,
  PageModelHostMode,
  PageModelRequirements,
  PageModelValidationIssue,
  PageModelValidationResult,
} from './contracts'
import {
  createInitialPageModelFlowState,
  createPageModelFileTexts,
} from './contracts'

export interface MemoryPageModelHostOptions {
  key: PageModelHostKey
  files: PageModelFileTexts
  mode?: PageModelHostMode
}

function assertJson(file: PageModelFileName, content: string, issues: PageModelValidationIssue[]): void {
  const trimmed = content.trim()
  if (trimmed === '' && file === 'pagedata.json') return
  if (trimmed === '' && file === 'rule.json') return
  try {
    JSON.parse(trimmed)
  } catch (error) {
    issues.push({
      code: 'INVALID_JSON',
      file,
      message: `${file} JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      fix: `修复 ${file} 为合法 JSON 后重试 edit.validate。`,
    })
  }
}

function toJsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseJsonText(file: PageModelFileName, content: string): unknown {
  const trimmed = content.trim()
  if (trimmed === '') {
    return file === 'rule.json' ? [] : {}
  }
  return JSON.parse(trimmed) as unknown
}

function now(): string {
  return new Date().toISOString()
}

function markDirty(flowState: PageModelFlowState): PageModelFlowState {
  return {
    ...flowState,
    validated: false,
    committed: false,
    dirty: true,
    updatedAt: now(),
  }
}

function clearValidation(flowState: PageModelFlowState): PageModelFlowState {
  return {
    opened: flowState.opened,
    requirementsConfirmed: flowState.requirementsConfirmed,
    validated: false,
    committed: false,
    dirty: false,
    updatedAt: now(),
  }
}

export function createMemoryPageModelHost(options: MemoryPageModelHostOptions): PageModelHost {
  let files = createPageModelFileTexts(options.files)
  let committedFiles = createPageModelFileTexts(options.files)
  let flowState = createInitialPageModelFlowState()
  let requirements: PageModelRequirements | null = null
  const mode = options.mode ?? 'headless'

  function readFile(name: PageModelFileName): string {
    return files[name]
  }

  function writeFile(name: PageModelFileName, content: string): void {
    files = {
      ...files,
      [name]: content,
    }
    flowState = markDirty(flowState)
  }

  function readAllFiles(): PageModelFileTexts {
    return createPageModelFileTexts(files)
  }

  function replaceAllFiles(nextFiles: PageModelFileTexts): void {
    files = createPageModelFileTexts(nextFiles)
    flowState = markDirty(flowState)
  }

  function getNodeTree(): unknown {
    return parseJsonText('rule.json', files['rule.json'])
  }

  function setNodeTree(next: unknown): void {
    writeFile('rule.json', toJsonText(next))
  }

  function getDataSetTool(): unknown {
    return parseJsonText('pagedata.json', files['pagedata.json'])
  }

  function setDataSetTool(next: unknown): void {
    writeFile('pagedata.json', toJsonText(next))
  }

  function getFlowState(): PageModelFlowState {
    return { ...flowState }
  }

  function setFlowState(next: PageModelFlowState): void {
    flowState = { ...next }
  }

  function getRequirements(): PageModelRequirements | null {
    return requirements === null
      ? null
      : {
          ...requirements,
          constraints: [...requirements.constraints],
          assumptions: [...requirements.assumptions],
        }
  }

  function setRequirements(next: PageModelRequirements): void {
    requirements = {
      ...next,
      constraints: [...next.constraints],
      assumptions: [...next.assumptions],
    }
    flowState = {
      ...flowState,
      requirementsConfirmed: true,
      updatedAt: now(),
    }
  }

  function validate(): PageModelValidationResult {
    const issues: PageModelValidationIssue[] = []
    if (!flowState.opened) {
      issues.push({
        code: 'FLOW_NOT_OPENED',
        message: '页面模型编辑流程尚未打开。',
        fix: '先调用 edit.open 绑定当前 PageModelHost。',
      })
    }
    if (requirements === null) {
      issues.push({
        code: 'REQUIREMENTS_NOT_CONFIRMED',
        message: '具体业务需求和限制尚未确认。',
        fix: '先调用 edit.confirmRequirements 写入本轮需求限制。',
      })
    }
    assertJson('rule.json', files['rule.json'], issues)
    assertJson('pagedata.json', files['pagedata.json'], issues)
    return { ok: issues.length === 0, issues }
  }

  function commit(): Promise<PageModelCommitResult> {
    const validation = validate()
    if (!validation.ok) {
      flowState = {
        ...flowState,
        validated: false,
        committed: false,
        lastValidation: validation,
        updatedAt: now(),
      }
      return Promise.resolve({
        ok: false,
        mode,
        filesWritten: [],
        error: validation.issues.map((issue) => issue.message).join('；'),
      })
    }
    flowState = {
      ...flowState,
      validated: true,
      committed: true,
      dirty: false,
      lastValidation: validation,
      updatedAt: now(),
    }
    committedFiles = createPageModelFileTexts(files)
    return Promise.resolve({ ok: true, mode, filesWritten: [] })
  }

  function rollback(): Promise<void> {
    files = createPageModelFileTexts(committedFiles)
    flowState = clearValidation(flowState)
    return Promise.resolve()
  }

  return {
    key: options.key,
    mode,
    readFile,
    writeFile,
    readAllFiles,
    replaceAllFiles,
    getNodeTree,
    setNodeTree,
    getDataSetTool,
    setDataSetTool,
    getFlowState,
    setFlowState,
    getRequirements,
    setRequirements,
    validate,
    commit,
    rollback,
  }
}
