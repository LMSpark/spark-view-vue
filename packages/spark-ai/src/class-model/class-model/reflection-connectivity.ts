import type { AiApiAttributeMetadata, AiApiObjectMetadata, AiModuleMetadataJson } from '../metadata'
import type { ClassModelDocument } from './types'
import {
  listAttributeReachableKinds,
  projectClassModelFromApi,
  resolveModuleApi,
} from './model-projection'

export type ClassModelReflectionConnectivityIssue = Readonly<{
  code: string
  path: string
  message: string
}>

/**
 * 审计 ClassModel 反射与属性链是否断路。
 *
 * ClassModelDocument 不预存 models；registry className 必须可投影，且非 root 须经子模型字段链可达。
 */
export function auditClassModelReflectionConnectivity(
  document: ClassModelDocument,
): readonly ClassModelReflectionConnectivityIssue[] {
  const issues: ClassModelReflectionConnectivityIssue[] = []
  const apisByKind = collectApisByKind(document.module)
  const reachable = new Set(listAttributeReachableKinds(document))

  for (const kind of listRegistryKinds(document.module)) {
    try {
      projectClassModelFromApi(resolveModuleApi(document, kind))
    } catch (error) {
      issues.push({
        code: 'REFLECTION_MODEL_PROJECTION_FAILED',
        path: kind,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const [kind, api] of apisByKind) {
    for (const attribute of api.attributes ?? []) {
      auditAttributeReflection({
        issues,
        ownerKind: kind,
        attribute,
        document,
      })
    }
  }

  for (const kind of listRegistryKinds(document.module)) {
    if (kind === document.rootKind) continue
    if (!reachable.has(kind)) {
      issues.push({
        code: 'REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES',
        path: kind,
        message: `className "${kind}" 无法从 root "${document.rootKind}" 经子模型公开字段链到达。`,
      })
    }
  }

  return issues
}

function auditAttributeReflection(command: Readonly<{
  issues: ClassModelReflectionConnectivityIssue[]
  ownerKind: string
  attribute: AiApiAttributeMetadata
  document: ClassModelDocument
}>): void {
  const nestedKind = command.attribute.api?.kind
  if (nestedKind === undefined || nestedKind.length === 0) return
  if (!isRegistryKind(command.document.module, nestedKind)) {
    command.issues.push({
      code: 'REFLECTION_ATTRIBUTE_API_DISCONNECTED',
      path: `${command.ownerKind}.attributes.${command.attribute.name}`,
      message: `属性 "${command.attribute.name}" 反射到 className "${nestedKind}"，但 module apiRegistry 无该 className。`,
    })
  }
}

function isRegistryKind(module: AiModuleMetadataJson, kind: string): boolean {
  return module.rootApi.kind === kind || module.apiRegistry?.[kind] !== undefined
}

function listRegistryKinds(module: AiModuleMetadataJson): readonly string[] {
  return [module.rootApi.kind, ...Object.keys(module.apiRegistry ?? {})].sort()
}

function collectApisByKind(module: AiModuleMetadataJson): Map<string, AiApiObjectMetadata> {
  const apiByKind = new Map<string, AiApiObjectMetadata>()
  const pending: AiApiObjectMetadata[] = [module.rootApi, ...Object.values(module.apiRegistry ?? {})]
  while (pending.length > 0) {
    const api = pending.shift()
    if (api === undefined || apiByKind.has(api.kind)) continue
    apiByKind.set(api.kind, api)
    pending.push(...collectNestedApis(api))
  }
  return apiByKind
}

function collectNestedApis(api: AiApiObjectMetadata): readonly AiApiObjectMetadata[] {
  const apis: AiApiObjectMetadata[] = []
  for (const attribute of api.attributes ?? []) {
    if (attribute.api !== undefined) apis.push(attribute.api)
  }
  for (const action of api.actions) {
    for (const ref of action.resultApis ?? []) {
      if (ref.api !== undefined) apis.push(ref.api)
    }
  }
  return apis
}
