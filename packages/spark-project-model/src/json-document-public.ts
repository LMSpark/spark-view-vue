/**
 * @spark-view/spark-project-model/json-document
 *
 * JSON 文档编辑核心子路径。
 * 仅导出 json-document 相关符号。
 */

export * as JsonDocumentRuntime from './design/json-document'

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
} from './design/json-document'
