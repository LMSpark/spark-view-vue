/**
 * @module @spark-appworks/spark-project-model:domain-model/navigation/navigation-row-bridge
 * 职责：提供项目模型层 navigation-row-bridge 能力，围绕 模块入口、副作用注册或内部组合逻辑 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 domain-model/navigation/navigation-row-bridge。
 */
import { deepClone } from '@spark-appworks/spark-utils'
import {
  createNavigationNodeDraft,
  createNavigationNodePatch,
  type NavigationNodePatch,
} from '../../navigation/navigation-edit'
import {
  flattenProjectNavigationRoot,
  normalizeNavRoot,
} from '../../navigation/navigation-tree'
import type { NavNodeKind, ProjectModelData, ProjectNodeData } from '../../navigation/project-node'
import { NavigationRowModel } from './navigation-row-model'

/** 将导航扁平行转为 NavigationClient 可接受的节点数据。 */
export function navigationRowToNodeData(row: NavigationRowModel): ProjectNodeData {
  return {
    id: row.id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    nodeKind: normalizeNavigationRowNodeKind(row.nodeKind),
    ...(row.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: row.planningAttachmentRef }),
    ...(row.path === undefined ? {} : { path: row.path }),
    ...(row.icon === undefined ? {} : { icon: row.icon }),
  }
}

/** 由导航树 root 展开为扁平行模型列表（不含 pageConfig，需另行 load）。 */
export function navigationRowsFromRoot(
  root: ProjectModelData,
  projectId: string,
  tenantId: string,
): NavigationRowModel[] {
  const cloned = deepClone(normalizeNavRoot(root))
  const rootId = cloned.id?.trim() ?? projectId
  if (rootId === '') {
    throw new Error('navigationRowsFromRoot: 导航 root.id 不能为空')
  }
  const flat = flattenProjectNavigationRoot({ ...cloned, id: rootId })
  return flat.map(({ node, pid }) => new NavigationRowModel({
    id: node.id,
    parentId: pid,
    projectId,
    tenantId,
    title: node.title,
    description: node.description ?? '',
    nodeKind: node.nodeKind ?? 'page',
    ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    ...(node.path === undefined ? {} : { path: node.path }),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
    pageConfig: null,
  }))
}

/** 由扁平行生成 NavigationClient.updateNode 可用的 patch。 */
export function navigationRowPatch(row: NavigationRowModel): NavigationNodePatch & Pick<ProjectNodeData, 'title' | 'nodeKind'> {
  return createNavigationNodePatch(createNavigationNodeDraft(navigationRowToNodeData(row))).patch
}

/** 计算扁平行在同级兄弟中的索引（供 addNode 使用）。 */
export function navigationRowSiblingIndex(
  rows: readonly NavigationRowModel[],
  row: NavigationRowModel,
): number {
  const siblings = rows.filter((item) => item.parentId === row.parentId)
  const index = siblings.findIndex((item) => item.id === row.id)
  return index >= 0 ? index : siblings.length
}

function normalizeNavigationRowNodeKind(nodeKind: string): NavNodeKind {
  switch (nodeKind) {
    case 'system-directory':
      return 'system-directory'
    case 'module':
      return 'module'
    case 'system-page':
      return 'system-page'
    case 'system-action':
      return 'system-action'
    case 'page':
      return 'page'
    case 'link':
      return 'link'
    case 'sub-page':
      return 'sub-page'
    case 'ref':
      return 'ref'
    default:
      throw new Error(`navigationRowToNodeData: invalid nodeKind "${nodeKind}"`)
  }
}
