/**
 * @module @spark-appworks/spark-project-model:domain-model/project/project-root-bridge
 * @spark-appworks/spark-project-model 的 domain-model/project/project-root-bridge 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { ProjectModel } from '../../project/project-model'
import { buildNavRoot, buildProjectNavigationTree } from '../../navigation/navigation-tree'
import type { ProjectModelData, ProjectNodeData } from '../../navigation/project-node'
import { navigationRowToNodeData, navigationRowsFromRoot } from '../navigation/navigation-row-bridge'
import { NavigationRowModel } from '../navigation/navigation-row-model'
import { ProjectRootModel } from './project-root-model'

function rowFromProjectNode(project: ProjectModel, node: { id: string; pid: string; title: string; description: string; nodeKind: string; planningAttachmentRef?: string }): NavigationRowModel {
  return new NavigationRowModel({
    id: node.id,
    parentId: node.pid,
    projectId: project.projectId,
    tenantId: project.tenantId ?? '',
    title: node.title,
    description: node.description,
    nodeKind: node.nodeKind,
    ...(node.planningAttachmentRef === undefined
      ? {}
      : { planningAttachmentRef: node.planningAttachmentRef }),
  })
}

/** 从旧栈 ProjectModel 投影出 ProjectRootModel（AI 新栈只读写字段链）。 */
export function projectRootModelFromProjectModel(project: ProjectModel): ProjectRootModel {
  const domain = new ProjectRootModel({
    projectId: project.projectId,
    name: project.name,
    tenantId: project.tenantId ?? '',
    navigationNodes: project.flatRows.map((node) => rowFromProjectNode(project, {
      id: node.id,
      pid: node.pid,
      title: node.title,
      description: node.description,
      nodeKind: node.nodeKind,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    })),
  })
  domain.selectedNodeId = project.session.session.selectedNodeId
  domain.dirty = project.navigationDirty
  return domain
}

/** 将 ProjectRootModel 导航变更写回旧栈 ProjectModel（内存真源同步）。 */
export function applyProjectRootModelToProjectModel(
  domain: ProjectRootModel,
  project: ProjectModel,
): ProjectModelData {
  const children = domain.toTree()
  const root = project.replaceNavigationChildren(children)
  project.session.setSelectedNodeId(domain.selectedNodeId)
  return root
}

/** 从导航树 root DTO 构造 ProjectRootModel。 */
export function projectRootModelFromNavigationRoot(
  root: ProjectModelData,
  projectId: string,
  tenantId: string,
  name?: string,
): ProjectRootModel {
  return new ProjectRootModel({
    projectId,
    name: name ?? root.title,
    tenantId,
    navigationNodes: navigationRowsFromRoot(root, projectId, tenantId),
  })
}

/** 将扁平行重建为顶层 children 树（不含 module 根）。 */
export function projectRootChildrenFromRows(rows: readonly NavigationRowModel[]): ProjectNodeData[] {
  const rootId = rows.find((row) => row.parentId === '')?.id ?? ''
  const tree = buildProjectNavigationTree(rows.map((row) => ({
    id: row.id,
    pid: row.parentId,
    toNodeData: () => navigationRowToNodeData(row),
  })))
  if (rootId === '') return tree
  const moduleRoot = tree.find((node) => node.id === rootId) ?? tree[0]
  return moduleRoot?.children ?? []
}

/** 从扁平行提取 module 根元数据。 */
export function projectRootMetadataFromRows(
  rows: readonly NavigationRowModel[],
  projectId: string,
  name: string,
): Partial<ProjectModelData> {
  const rootRow = rows.find((row) => row.parentId === '') ?? rows.find((row) => row.id === projectId)
  return {
    id: rootRow?.id ?? projectId,
    title: rootRow?.title ?? name,
    ...(rootRow?.description ? { description: rootRow.description } : {}),
    nodeKind: 'module',
    childPlacement: 'header',
  }
}

/** 由 children + 根元数据构建完整 navigationRoot DTO。 */
export function buildProjectRootNavigationData(
  domain: ProjectRootModel,
  children: readonly ProjectNodeData[],
): ProjectModelData {
  return buildNavRoot([...children], projectRootMetadataFromRows(
    domain.navigationNodes,
    domain.projectId,
    domain.name,
  ))
}
