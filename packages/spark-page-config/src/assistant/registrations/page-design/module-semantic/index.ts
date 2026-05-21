/**
 * Page-design 模块语义协议(module-semantic)子目录入口。
 *
 * 汇出 NodeTreeModuleKind / NodeTreeCapability,
 * 供 PageDesign 的 ModuleSemanticRuntime 直接注册。
 */

export { NodeTreeModuleKind } from './node-tree-module-kind'
export {
  NodeTreeCapability,
} from './node-tree-capability'
export type {
  NodeTreeCapabilityOptions,
} from './node-tree-capability'
