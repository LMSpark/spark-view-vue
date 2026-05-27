/**
 * @spark-view/spark-page-config/json-document
 *
 * JSON 文档编辑核心子路径 — 委托给 page-editor.ts 唯一通道。
 * 仅导出 json-document 相关符号。
 */

export { JsonDocumentRuntime } from './editor/page-editor'

export {
  addChildNode,
  addSiblingNode,
  applyAutoPopulatePatches,
  buildJsonTreeRows,
  buildTreeModel,
  deleteNode,
  ensureUniqueObjectKey,
  exportJsonDocument,
  filterTreeNodes,
  flattenJsonDocumentForEdit,
  formatJsonPath,
  formatValuePreview,
  getNodePath,
  getValueAtJsonPath,
  isJsonObject,
  isRecord,
  normalizeJsonDocument,
  parseJsonDocument,
  renameNodeKey,
  resolveSchemaInfoForPath,
  restoreJsonDocumentByOriginalType,
  restoreJsonDocumentFromFlat,
  rootOf,
  serializeJsonDocument,
  toDisplayRows,
  updateNodeType,
  updateNodeValue,
  type AutoPopulateEntry,
  type FlatJsonTreeDocument,
  type JsonDocument,
  type JsonNodeType,
  type JsonObject,
  type JsonPath,
  type JsonSchemaInfo,
  type JsonTreePolicy,
  type JsonValue,
  type MutationResult,
  type RenameNodeKeyInput,
  type TreeDisplayNode,
  type TreeNode,
  type TreeModel,
  type UpdateNodeTypeInput,
} from './editor/page-editor'
