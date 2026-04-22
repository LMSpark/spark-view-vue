// ── stills meta ──────────────────────────────────────────────
export const STILLS_CAPABILITIES_ACTION = 'stills.capabilities'
export const STILLS_ACTION_SPEC_ACTION = 'stills.actionSpec'
export const SESSION_DESCRIBE_ACTION = 'session.describe'
export const CATALOG_QUERY_ACTION = 'catalog.query'
export const CATALOG_GUIDE_ACTION = 'catalog.guide'

// ── blueprint ────────────────────────────────────────────────
export const BLUEPRINT_CREATE_ACTION = 'blueprint.create'
export const BLUEPRINT_DESCRIBE_ACTION = 'blueprint.describe'
export const BLUEPRINT_ADVANCE_ACTION = 'blueprint.advance'
export const BLUEPRINT_ITEM_ADVANCE_ACTION = 'blueprint.item.advance'
export const BLUEPRINT_REVISE_ACTION = 'blueprint.revise'
export const BLUEPRINT_VALIDATE_COVERAGE_ACTION = 'blueprint.validateCoverage'
export const BLUEPRINT_SELF_CHECK_ACTION = 'blueprint.selfCheck'

// ── dataset ──────────────────────────────────────────────────
export const DATASET_BOOTSTRAP_ACTION = 'dataset.bootstrap'
export const DATASET_DESCRIBE_ACTION = 'dataset.describe'
export const DATASET_VALIDATE_ACTION = 'dataset.validate'
export const DATASET_EXPORT_ACTION = 'dataset.export'
export const DATASET_RESET_ACTION = 'dataset.reset'

// ── datatable ────────────────────────────────────────────────
export const DATATABLE_CREATE_ACTION = 'datatable.create'
export const DATATABLE_DESCRIBE_ACTION = 'datatable.describe'
export const DATATABLE_ADD_COLUMNS_ACTION = 'datatable.addColumns'
export const DATATABLE_UPDATE_COLUMN_ACTION = 'datatable.updateColumn'
export const DATATABLE_REMOVE_COLUMN_ACTION = 'datatable.removeColumn'
export const DATATABLE_SET_API_ACTION = 'datatable.setApi'
export const DATATABLE_ADD_ROWS_ACTION = 'datatable.addRows'

// ── relation ─────────────────────────────────────────────────
export const RELATION_ADD_ACTION = 'relation.add'
export const RELATION_REMOVE_ACTION = 'relation.remove'
export const RELATION_LIST_ACTION = 'relation.list'

// ── schema ───────────────────────────────────────────────────
export const SCHEMA_LOCK_ACTION = 'schema.lock'
export const SCHEMA_UNLOCK_ACTION = 'schema.unlock'

// ── dataview ─────────────────────────────────────────────────
export const DATAVIEW_CREATE_ACTION = 'dataview.create'
export const DATAVIEW_DESCRIBE_ACTION = 'dataview.describe'
export const DATAVIEW_CONFIGURE_ACTION = 'dataview.configure'
export const DATAVIEW_SET_AGGREGATES_ACTION = 'dataview.setAggregates'
export const DATAVIEW_SET_TREE_CONFIG_ACTION = 'dataview.setTreeConfig'

// ── dependency ───────────────────────────────────────────────
export const DEPENDENCY_ADD_ACTION = 'dependency.add'
export const DEPENDENCY_REMOVE_ACTION = 'dependency.remove'

// ── pageconfig / edit ────────────────────────────────────────
export const PAGECONFIG_BOOTSTRAP_ACTION = 'pageconfig.bootstrap'
export const PAGECONFIG_VALIDATE_ACTION = 'pageconfig.validate'
export const PAGECONFIG_EXPORT_ACTION = 'pageconfig.export'
export const PAGECONFIG_DESCRIBE_ACTION = 'pageconfig.describe'

// ── pageconfig rule/script/style ─────────────────────────────
export const RULE_ADD_COMPONENT_ACTION = 'rule.addComponent'
export const RULE_SET_PROPS_ACTION = 'rule.setProps'
export const RULE_REMOVE_COMPONENT_ACTION = 'rule.removeComponent'
export const RULE_SET_LAYOUT_ACTION = 'rule.setLayout'
export const SCRIPT_ADD_HANDLER_ACTION = 'script.addHandler'
export const SCRIPT_ADD_INIT_LOGIC_ACTION = 'script.addInitLogic'
export const SCRIPT_REPLACE_HANDLER_ACTION = 'script.replaceHandler'
export const SCRIPT_REMOVE_HANDLER_ACTION = 'script.removeHandler'
export const SCRIPT_SET_VAR_ACTION = 'script.setVar'
export const SCRIPT_REMOVE_VAR_ACTION = 'script.removeVar'
export const STYLE_ADD_RULE_ACTION = 'style.addRule'
export const STYLE_REMOVE_RULE_ACTION = 'style.removeRule'
export const STYLE_SET_THEME_ACTION = 'style.setTheme'

// ── text-model (edit-domain) ─────────────────────────────────
export const TEXT_MODEL_READ_SCRIPT_ACTION = 'textModel.readScript'
export const TEXT_MODEL_WRITE_SCRIPT_ACTION = 'textModel.writeScript'
export const TEXT_MODEL_READ_STYLE_ACTION = 'textModel.readStyle'
export const TEXT_MODEL_WRITE_STYLE_ACTION = 'textModel.writeStyle'

export const EDIT_BOOTSTRAP_ACTION = 'edit.bootstrap'
export const EDIT_CHANGED_LINES_ACTION = 'edit.changedLines'
export const EDIT_EXPORT_FILES_ACTION = 'edit.exportFiles'

// ── dataset (edit-domain proxy actions) ──────────────────────
export const DATASET_CHANGED_LINES_ACTION = 'dataset.changedLines'
