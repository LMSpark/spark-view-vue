/**
 * Page-design 模块语义协议(module-semantic)子目录入口。
 *
 * 汇出 NodeTreeModuleKind / NodeTreeCapability(参考实现),
 * 供消费方挂接到 ModuleSemanticRuntime + ModuleSemanticBusinessRuntime。
 */

export { NodeTreeModuleKind } from './node-tree-module-kind'
export {
  NodeTreeCapability,
} from './node-tree-capability'
export type {
  NodeTreeCapabilityOptions,
} from './node-tree-capability'
