/**
 * vcm-native/metadata · VCM API 对象元数据校验
 *
 * Fail-fast 校验 VCM 生成的 API 对象图，避免 LLM 看见无法执行的 action 契约。
 */

import type { AiApiObjectMetadata } from './ai-api-object-metadata-schema'

export type ApiObjectValidationFinding = Readonly<{
  level: 'error' | 'warn'
  rule: string
  message: string
  fix?: string
}>

export class AiApiObjectMetadataValidationError extends Error {
  public constructor(
    public readonly kind: string,
    public readonly findings: readonly ApiObjectValidationFinding[],
  ) {
    super(`API object metadata validation failed for "${kind}": ${findings.map(f => f.message).join('; ')}`)
  }
}

export function validateApiObjectMetadata(api: AiApiObjectMetadata): void {
  const findings = collectApiObjectMetadataFindings(api, [])
  const errors = findings.filter(finding => finding.level === 'error')
  if (errors.length > 0) {
    throw new AiApiObjectMetadataValidationError(api.kind, findings)
  }
}

function collectApiObjectMetadataFindings(
  api: AiApiObjectMetadata,
  ancestry: readonly string[],
): ApiObjectValidationFinding[] {
  const findings: ApiObjectValidationFinding[] = []
  const location = ancestry.length === 0 ? api.kind : [...ancestry, api.kind].join(' > ')

  if (api.kind.trim().length === 0) {
    findings.push({ level: 'error', rule: 'kind-required', message: `${location} kind 不能为空` })
  } else if (api.kind !== api.kind.toLowerCase()) {
    findings.push({ level: 'error', rule: 'kind-lowercase', message: `kind "${api.kind}" 必须全小写` })
  }
  if (api.name.trim().length === 0) {
    findings.push({ level: 'error', rule: 'name-required', message: `${api.kind} name 不能为空` })
  }
  if (api.description.trim().length === 0) {
    findings.push({ level: 'error', rule: 'description-required', message: `${api.kind} description 不能为空` })
  }
  const constructorMetadata = api.constructorSignature
  if (constructorMetadata !== undefined) {
    if (constructorMetadata.description.trim().length === 0) {
      findings.push({ level: 'error', rule: 'constructor-description-required', message: `${api.kind} constructor description 不能为空` })
    }
    if (constructorMetadata.paramsSchema.type !== 'object') {
      findings.push({ level: 'error', rule: 'constructor-params-schema-invalid', message: `${api.kind} constructor paramsSchema 必须是 type=object` })
    }
  }
  if (api.actions.length === 0) {
    findings.push({ level: 'error', rule: 'actions-required', message: `${api.kind} 至少需要一个 action` })
  }

  const actionNames = new Set<string>()
  for (const action of api.actions) {
    const actionLabel = `${api.kind}.${action.name}`
    if (action.name.trim().length === 0) {
      findings.push({ level: 'error', rule: 'action-name-required', message: `${api.kind} action name 不能为空` })
    }
    if (actionNames.has(action.name)) {
      findings.push({ level: 'error', rule: 'action-name-duplicate', message: `重复的 actionName: "${action.name}"` })
    }
    actionNames.add(action.name)
    if (action.methodName.trim().length === 0) {
      findings.push({ level: 'error', rule: 'method-name-required', message: `${actionLabel} 缺少 methodName` })
    }
    if (action.description.trim().length === 0) {
      findings.push({ level: 'error', rule: 'action-description-required', message: `${actionLabel} description 不能为空` })
    }
    if (action.paramsSchema.type !== 'object') {
      findings.push({ level: 'error', rule: 'params-schema-invalid', message: `${actionLabel} paramsSchema 必须是 type=object` })
    }
    for (const ref of action.resultApis ?? []) {
      if (!Array.isArray(ref.resultPath)) {
        findings.push({ level: 'error', rule: 'result-path-required', message: `${actionLabel} resultApi 缺少 resultPath 数组` })
      }
      const refKind = ref.$ref?.trim()
      if (refKind !== undefined && refKind.length > 0) {
        if (ref.api !== undefined) {
          findings.push({ level: 'error', rule: 'result-ref-ambiguous', message: `${actionLabel} resultApi 不能同时包含 api 与 $ref` })
        }
        continue
      }
      if (ref.api === undefined) {
        findings.push({ level: 'error', rule: 'result-api-required', message: `${actionLabel} resultApi 缺少 api 或 $ref` })
        continue
      }
      findings.push(...collectApiObjectMetadataFindings(ref.api, [...ancestry, api.kind]))
    }
  }

  return findings
}
