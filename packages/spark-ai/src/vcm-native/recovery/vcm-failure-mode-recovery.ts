/**
 * VCM-native recovery：从构建期 metadata 的 @failureMode 自动派生 RECOVERY_HINT。
 *
 * ClassModel 是 VCM 知识索引（vcm_*_guide）；连通性在构建期 fail-fast，无 diagnostics 旁路。
 * recovery 只读 metadata @failureMode，不遍历 ClassModel 图，不在 app 层补链。
 */
import type {
  AiApiActionFailureMode,
  AiApiObjectMetadata,
  AiModuleMetadataJson,
} from '../metadata'

export type VcmFailureModeRecoveryCommand = Readonly<{
  callResult: Readonly<{
    code: string
    msg: string
  }>
  moduleInstanceId?: string
}>

export type VcmFailureModeRecoveryContext = Readonly<{
  kind: string
  actionName: string
  mode: AiApiActionFailureMode
}>

export function collectVcmFailureModeRecoveryHints(
  metadata: AiModuleMetadataJson,
  command: VcmFailureModeRecoveryCommand,
): readonly string[] {
  const code = command.callResult.code
  const candidates = collectFailureModeCandidates(metadata, code)
  if (candidates.length === 0) return []

  const matched = candidates.filter(candidate => failureModeMatchesFailure(candidate.mode, command))
  const selected = matched.length > 0 ? matched : (candidates.length === 1 ? candidates : [])

  const hints: string[] = []
  const seen = new Set<string>()
  for (const candidate of selected) {
    const hint = formatFailureModeRecoveryHint(candidate, command)
    if (seen.has(hint)) continue
    seen.add(hint)
    hints.push(hint)
  }
  return hints
}

function collectFailureModeCandidates(
  metadata: AiModuleMetadataJson,
  code: string,
): readonly VcmFailureModeRecoveryContext[] {
  const out: VcmFailureModeRecoveryContext[] = []
  for (const api of collectModuleApis(metadata)) {
    for (const action of api.actions) {
      for (const mode of action.failureModes ?? []) {
        if (mode.code !== code) continue
        out.push({ kind: api.kind, actionName: action.name, mode })
      }
    }
  }
  return out
}

function collectModuleApis(metadata: AiModuleMetadataJson): readonly AiApiObjectMetadata[] {
  const apis: AiApiObjectMetadata[] = [metadata.rootApi]
  if (metadata.apiRegistry !== undefined) {
    for (const api of Object.values(metadata.apiRegistry)) {
      apis.push(api)
    }
  }
  return apis
}

function failureModeMatchesFailure(
  mode: AiApiActionFailureMode,
  command: VcmFailureModeRecoveryCommand,
): boolean {
  const when = mode.when.trim()
  if (when.length === 0) return true
  return whenContextMatchesMsg(when, command.callResult.msg)
}

function whenContextMatchesMsg(when: string, msg: string): boolean {
  const msgLower = msg.toLowerCase()
  const englishTokens = when.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) ?? []
  for (const token of englishTokens) {
    if (msgLower.includes(token.toLowerCase())) return true
  }
  const fragments = when.split(/[\s，。、；=>]+/).filter(fragment => fragment.length >= 2)
  for (const fragment of fragments) {
    if (msg.includes(fragment)) return true
  }
  return false
}

function formatFailureModeRecoveryHint(
  candidate: VcmFailureModeRecoveryContext,
  command: VcmFailureModeRecoveryCommand,
): string {
  let fix = interpolateFailureModeFix(candidate.mode.fix, command)
  const lookup = `vcm_action_guide({ kind: "${candidate.kind}", actionName: "${candidate.actionName}" })`
  if (!fix.includes('vcm_action_guide')) {
    fix = `${fix} 反查指南：${lookup}。`
  }
  return fix
}

function interpolateFailureModeFix(
  fix: string,
  command: VcmFailureModeRecoveryCommand,
): string {
  const pageId = command.moduleInstanceId?.trim()
  if (pageId === undefined || pageId.length === 0) return fix
  return fix.replaceAll('<pageId>', pageId)
}

