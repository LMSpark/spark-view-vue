/**
 * 页面设计期工件 re-export barrel。
 *
 * 原文件已拆分为 artifacts/rule-artifacts.ts、artifacts/data-artifacts.ts、
 * artifacts/design-flow.ts。本文件保留作为过渡期兼容入口。
 */

export {
  createRuleEditorComponentMetadata,
  createRuleJsonSchema,
  createRuleTreePolicy,
  RuleEditorComponent,
} from '../artifacts/rule-artifacts'

export {
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  PAGE_DATA_JSON_SCHEMA,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type DesignerColumnProjection,
  type DesignerRelationProjection,
  type DesignerTableProjection,
  type DesignerTableUiState,
  type PageDataEditorMode,
} from '../artifacts/data-artifacts'

export {
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  listPageDesignFlowSteps,
  PAGE_DESIGN_100_STEP_FLOW,
  summarizePageDesignFlowPhases,
  type PageDesignFlowPhaseSummary,
  type PageDesignFlowStep,
} from '../artifacts/design-flow'
