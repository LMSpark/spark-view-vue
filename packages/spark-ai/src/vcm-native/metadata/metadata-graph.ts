/**
 * VCM metadata 对象图遍历。
 *
 * 协议真源线：模型（AiApiObjectMetadata）→ 属性 || 方法（action）→ 子模块（嵌套 api）。
 * 实例由会话 scope 钉死；LLM 发现走 metadata 图，执行走 vcm_script 对象链，不用 /kind[id] path。
 */

import type { AiApiObjectMetadata } from './ai-api-object-metadata-schema'

/** 从父模型到子模型的边：经可读/可写属性，或经 action 的 resultApis。 */
export type AiApiMetadataGraphEdge = Readonly<{
  parentKind: string
  via: 'attribute' | 'action'
  viaName: string
  child: AiApiObjectMetadata
}>

/** metadata 图中的一个节点（含出边）。 */
export type AiApiMetadataGraphNode = Readonly<{
  api: AiApiObjectMetadata
  parentKind?: string
  edges: readonly AiApiMetadataGraphEdge[]
}>

/** 扁平嵌套 API 记录，供 guide 投影或注册 companion（迁移期）。 */
export type AiApiNestedApiRecord = Readonly<{
  api: AiApiObjectMetadata
  parentKind: string
  via: AiApiMetadataGraphEdge['via']
  viaName: string
}>

/**
 * 自 rootApi 深度优先遍历 metadata 图，返回每个节点的出边。
 * 同一 kind 在图中只展开一次（防 resultApis 环）。
 */
export function walkAiApiMetadataGraph(rootApi: AiApiObjectMetadata): readonly AiApiMetadataGraphNode[] {
  const nodes: AiApiMetadataGraphNode[] = []
  const visited = new Set<string>()

  const visit = (api: AiApiObjectMetadata, parentKind?: string): void => {
    const edges = collectOutgoingEdges(api)
    nodes.push({
      api,
      ...(parentKind === undefined ? {} : { parentKind }),
      edges,
    })
    if (visited.has(api.kind)) return
    visited.add(api.kind)
    for (const edge of edges) {
      visit(edge.child, api.kind)
    }
    visited.delete(api.kind)
  }

  visit(rootApi)
  return nodes
}

/** 收集 root 下所有嵌套 API（不含 root），按 kind 去重，保留首次发现的 parent/via。 */
export function collectNestedApiRecords(rootApi: AiApiObjectMetadata): readonly AiApiNestedApiRecord[] {
  const records = new Map<string, AiApiNestedApiRecord>()
  const visited = new Set<string>([rootApi.kind])

  const walk = (ownerApi: AiApiObjectMetadata): void => {
    for (const edge of collectOutgoingEdges(ownerApi)) {
      registerNested(edge, records)
      if (visited.has(edge.child.kind)) continue
      visited.add(edge.child.kind)
      try {
        walk(edge.child)
      } finally {
        visited.delete(edge.child.kind)
      }
    }
  }

  walk(rootApi)
  return [...records.values()]
}

function collectOutgoingEdges(ownerApi: AiApiObjectMetadata): readonly AiApiMetadataGraphEdge[] {
  const edges: AiApiMetadataGraphEdge[] = []

  for (const attribute of ownerApi.attributes ?? []) {
    if (attribute.api === undefined) continue
    edges.push({
      parentKind: ownerApi.kind,
      via: 'attribute',
      viaName: attribute.name,
      child: attribute.api,
    })
  }

  for (const action of ownerApi.actions) {
    for (const resultApi of action.resultApis ?? []) {
      if (resultApi.api === undefined) continue
      edges.push({
        parentKind: ownerApi.kind,
        via: 'action',
        viaName: action.name,
        child: resultApi.api,
      })
    }
  }

  return edges
}

function registerNested(
  edge: AiApiMetadataGraphEdge,
  records: Map<string, AiApiNestedApiRecord>,
): void {
  if (records.has(edge.child.kind)) return
  records.set(edge.child.kind, {
    api: edge.child,
    parentKind: edge.parentKind,
    via: edge.via,
    viaName: edge.viaName,
  })
}
