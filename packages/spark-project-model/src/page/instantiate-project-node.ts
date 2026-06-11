/**
 * @module @spark-appworks/spark-project-model:page/instantiate-project-node
 * 职责：提供项目模型和页面配置域中的 instantiate project node 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/** 配置页节点实例化——放在 page 层，避免 navigation 反向依赖 ConfigPageNode。 */
import type { ProjectNode } from '../navigation/project-node'
import { isConfigNodeKind } from '../navigation/navigation-tree'
import { instantiateNavigationKindNode } from '../navigation/navigation-kinds'
import {
  ConfigPageNode,
  ConfigSubPageNode,
  type ProjectConfigPageNodeModelOptions,
} from './config-page'

export function instantiateProjectNode(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (nodeKind === 'sub-page') return new ConfigSubPageNode(options)
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return instantiateNavigationKindNode(options)
}

export function isConfigPageNode(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}

export function isConfigSubPageNode(node: ProjectNode | null | undefined): node is ConfigSubPageNode {
  return node instanceof ConfigSubPageNode
}
