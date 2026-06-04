/**
 * tree/index.ts — 树编辑引擎公共入口
 */

// ── 类型 ──
export type {
  AutoPopulateEntry,
  FlatJsonTreeDocument,
  JsonNodeType,
  JsonTreePolicy,
  MutationResult,
  RenameNodeKeyInput,
  TreeDisplayNode,
  TreeModel,
  TreeNode,
  UpdateNodeTypeInput,
} from './tree-types'

// ── 值：构建 / 导出 / 显示 ──
export {
  buildJsonTreeRows,
  buildTreeModel,
  exportJsonDocument,
  filterTreeNodes,
  getNodePath,
  toDisplayRows,
} from './tree-build'

// ── 值：变更操作 ──
export {
  addChildNode,
  addSiblingNode,
  applyAutoPopulatePatches,
  deleteNode,
  renameNodeKey,
  updateNodeType,
  updateNodeValue,
} from './tree-mutation'

// ── 值：平铺往返 ──
export {
  flattenJsonDocumentForEdit,
  restoreJsonDocumentByOriginalType,
  restoreJsonDocumentFromFlat,
} from './tree-flatten'

// ── 值：公共工具 ──
export {
  ensureUniqueObjectKey,
  formatValuePreview,
  rootOf,
} from './tree-utils'
