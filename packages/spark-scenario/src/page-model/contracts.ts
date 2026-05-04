import type { AiScenarioFunctionCallResult } from '../contracts/function-call-contracts'

export const PAGE_MODEL_FILE_NAMES = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
] as const

export type PageModelFileName = typeof PAGE_MODEL_FILE_NAMES[number]

export type PageModelHostMode = 'ui' | 'headless'

export type PageModelFileTexts = {
  readonly [K in PageModelFileName]: string
}

export interface PageModelHostKey {
  tenantId: string
  projectId: string
  pageId: string
  sessionId: string
}

export interface PageModelRequirements {
  summary: string
  constraints: readonly string[]
  assumptions: readonly string[]
  confirmedAt: string
}

export interface PageModelValidationIssue {
  code: string
  message: string
  file?: PageModelFileName
  fix?: string
}

export interface PageModelValidationResult {
  ok: boolean
  issues: readonly PageModelValidationIssue[]
}

export interface PageModelCommitResult {
  ok: boolean
  mode: PageModelHostMode
  filesWritten: readonly PageModelFileName[]
  error?: string
}

export interface PageModelFlowState {
  opened: boolean
  requirementsConfirmed: boolean
  validated: boolean
  committed: boolean
  dirty: boolean
  lastValidation?: PageModelValidationResult
  updatedAt: string
}

export interface PageModelHost {
  readonly key: PageModelHostKey
  readonly mode: PageModelHostMode
  readFile: (name: PageModelFileName) => string
  writeFile: (name: PageModelFileName, content: string) => void
  readAllFiles: () => PageModelFileTexts
  replaceAllFiles: (files: PageModelFileTexts) => void
  getNodeTree: () => unknown
  setNodeTree: (next: unknown) => void
  getDataSetTool: () => unknown
  setDataSetTool: (next: unknown) => void
  getFlowState: () => PageModelFlowState
  setFlowState: (next: PageModelFlowState) => void
  getRequirements: () => PageModelRequirements | null
  setRequirements: (next: PageModelRequirements) => void
  validate: () => PageModelValidationResult
  commit: () => Promise<PageModelCommitResult>
  rollback?: () => Promise<void>
}

export type AiScenarioSessionKey = PageModelHostKey

export interface AiScenarioMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  createdAt: string
  toolCallId?: string
  name?: string
}

export interface AiScenarioSessionState {
  key: AiScenarioSessionKey
  messages: readonly AiScenarioMessage[]
  functionResults: readonly AiScenarioFunctionCallResult[]
  requirements: PageModelRequirements | null
  flowState: PageModelFlowState | null
  updatedAt: string
}

export interface AiScenarioSessionStore {
  get: (sessionKey: AiScenarioSessionKey) => Promise<AiScenarioSessionState | undefined>
  set: (sessionKey: AiScenarioSessionKey, state: AiScenarioSessionState) => Promise<void>
  appendMessage: (sessionKey: AiScenarioSessionKey, message: AiScenarioMessage) => Promise<void>
  appendFunctionResult: (sessionKey: AiScenarioSessionKey, result: AiScenarioFunctionCallResult) => Promise<void>
  clear: (sessionKey: AiScenarioSessionKey) => Promise<void>
}

export function createInitialPageModelFlowState(now = new Date().toISOString()): PageModelFlowState {
  return {
    opened: false,
    requirementsConfirmed: false,
    validated: false,
    committed: false,
    dirty: false,
    updatedAt: now,
  }
}

export function createPageModelFileTexts(files: PageModelFileTexts): PageModelFileTexts {
  return {
    'rule.json': files['rule.json'],
    'pagedata.json': files['pagedata.json'],
    'script.js': files['script.js'],
    'style.css': files['style.css'],
  }
}

export function serializePageModelHostKey(key: PageModelHostKey): string {
  return [key.tenantId, key.projectId, key.pageId, key.sessionId]
    .map((part) => encodeURIComponent(part))
    .join('|')
}
