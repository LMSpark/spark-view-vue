import {
  useRuleEditSession,
  type RuleEditRunHooks,
  type RuleEditSessionOptions,
  type LogEntry,
  TOOL_PARAM_EXAMPLES,
  TOOL_READ_ACTIONS,
  TOOL_WRITE_ACTIONS,
  TOOL_WRITE_SET,
} from './useRuleEditSession'

export type UnifiedEditSessionOptions = RuleEditSessionOptions
export type UnifiedEditRunHooks = RuleEditRunHooks
export type UnifiedLogEntry = LogEntry

export {
  TOOL_PARAM_EXAMPLES,
  TOOL_READ_ACTIONS,
  TOOL_WRITE_ACTIONS,
  TOOL_WRITE_SET,
}

// 统一会话入口：先复用现有实现，后续再把内部规则专属语义逐步抽离。
export const useUnifiedEditSession = useRuleEditSession
