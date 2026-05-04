import type { AiScenarioContext, AiScenarioToolRegistration } from '../contracts/scenario-types'
import type { PageModelHost } from './contracts'

export type PageModelToolType = 'describe' | 'request'

export type PageModelToolName = 'edit' | 'textModel' | 'sparkNodeTree' | 'datasetTool'

export interface PageModelToolFailureMode {
  code: string
  when: string
  fix: string
}

export interface PageModelToolFailure {
  ok: false
  code: string
  msg: string
  fix?: string
}

export interface PageModelToolExecutionContext {
  host: PageModelHost
  args: unknown
  scenarioContext: AiScenarioContext
}

export interface PageModelFunctionDefinition {
  action: string
  type: PageModelToolType
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  example?: Record<string, unknown>
  usageRules?: readonly string[]
  failureModes?: readonly PageModelToolFailureMode[]
  registration?: Omit<AiScenarioToolRegistration, 'execution'>
  persistAfterExecute?: 'success' | 'always'
  execute: (context: PageModelToolExecutionContext) => unknown
}

export interface PageModelToolFamily {
  name: PageModelToolName
  title: string
  description: string
  rules?: readonly string[]
  functions: readonly PageModelFunctionDefinition[]
}

export function isPageModelToolFailure(value: unknown): value is PageModelToolFailure {
  return (
    typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value as { ok?: unknown }).ok === false
    && 'code' in value
    && 'msg' in value
  )
}

export function pageModelToolFailure(params: {
  code: string
  msg: string
  fix?: string
}): PageModelToolFailure {
  return {
    ok: false,
    code: params.code,
    msg: params.msg,
    ...(params.fix !== undefined ? { fix: params.fix } : {}),
  }
}

export function getToolNamespace(action: string): string {
  const separatorIndex = action.indexOf('.')
  return separatorIndex < 0 ? action : action.slice(0, separatorIndex)
}

export function createPageModelFunction(
  definition: PageModelFunctionDefinition,
): PageModelFunctionDefinition {
  return definition
}
