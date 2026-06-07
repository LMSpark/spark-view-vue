/**
 * DevSystem 设计器制品：rule / pagedata 编辑器的 schema 与投影。
 * 消费 spark-project-model 的领域类型，但不反向进入该包。
 */

export {
  PAGE_DATA_JSON_SCHEMA,
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type DesignerRelationProjection,
  type DesignerTableUiState,
  type DesignerTableProjection,
} from './page-data-designer'

export {
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './rule-editor'
