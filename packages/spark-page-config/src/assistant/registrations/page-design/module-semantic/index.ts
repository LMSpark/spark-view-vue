/**
 * Page-design 模块语义协议(module-semantic)子目录入口。
 *
 * 汇出 node-tree ModuleKind factory,供 PageDesign 的 ModuleSemanticRuntime 注册。
 */

export { createNodeTreeModuleKind } from './node-tree-module-kind'
export type {
  NodeTreeModuleKindOptions,
} from './node-tree-module-kind'
