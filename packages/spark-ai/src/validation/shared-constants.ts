// ── 跨模块共享常量（config-validator + response-pipeline 复用）──────────────

/**
 * DataKey 格式校验正则
 *
 * 匹配 2 段或 3 段 @-分隔格式 + 可选 #scope 前缀 + 可选 .fieldPath 后缀。
 * 合法 field: rows | currentRow | selectedRows | summaryRow | selectionSummaryRow
 */
export const DATAKEY_RE = /^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\.[\w.]+)?$/

/**
 * HTML 原生标签白名单（组件类型校验时排除这些标签）
 *
 * 单一来源：config-validator 和 response-pipeline 共用同一集合。
 */
export const HTML_TYPES: ReadonlySet<string> = new Set([
  'a', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'code', 'del',
  'details', 'div', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'li', 'main',
  'nav', 'ol', 'option', 'p', 'pre', 'section', 'select', 'small', 'span',
  'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul',
])

/**
 * 合法组件类型前缀
 *
 * 组件 type 不在 HTML_TYPES 中时，需匹配这些前缀之一才被视为有效。
 */
export const VALID_TYPE_PREFIXES: readonly string[] = ['r-', 'el-', 'Render', 'spark-']

/**
 * 容器组件类型 → 渲染上下文映射
 *
 * config-validator 和 response-pipeline 共用同一映射。
 */
export const CONTAINER_CONTEXT_MAP: Record<string, 'table' | 'form' | 'detail' | 'list' | 'tree'> = {
  'r-table': 'table',
  'r-form': 'form',
  'r-detail': 'detail',
  'r-list': 'list',
  'r-tree': 'tree',
}

/**
 * 非字段 r-* 类型集合（容器/布局组件，不当作 field 处理）
 *
 * 单一来源：config-validator 和 response-pipeline 共用同一集合。
 */
export const NON_FIELD_R_TYPES: ReadonlySet<string> = new Set([
  'r-table', 'r-form', 'r-detail', 'r-list', 'r-tree',
  'r-tabs', 'r-collapse', 'r-dialog', 'r-drawer', 'r-steps', 'r-section', 'r-block',
  'r-column-group',
])
