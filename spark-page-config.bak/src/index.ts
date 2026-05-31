/**
 * @spark-view/spark-page-config
 *
 * 根入口只暴露 ProjectModel / PageNodeModel 数据真源和装配工厂。
 * 手动编辑、AI 更新、JSON 文档和独立业务示例分别走专用 subpath。
 */

export {
  ProjectModel,
} from './project/core/project-model'

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './project/node/page-node-factory'

export type {
  ProjectModelLike,
  ProjectModelOptions,
} from './project/core/project-model'

export {
  ProjectConfigPageNodeModel,
} from './project/node/project-node-model'

export type {
  PageNodeLike,
  PageNodeRenderConfig,
} from './project/node/project-node-model'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './project/node/page-node-factory'
