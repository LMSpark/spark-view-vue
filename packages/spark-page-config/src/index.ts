/**
 * @spark-view/spark-page-config
 *
 * 主入口：页面配置加载、编译与运行时 API。
 * 委托给 PageEditor（editor/page-editor），不再直接引用内部 config 模块。
 *
 * 子路径：
 * - ./editor — PageEditor 聚合编辑能力 + 设计时工具（DevSystem 使用）
 */

// ── 所有公开导出均委托 page-editor.ts ────────────────────────

export {
  BasePageConfigLoader,
  PAGE_CONFIG_FILE_NAMES,
  PageConfigFileDescriptor,
} from './editor/page-editor'

export type {
  ConfigLoaderOptions,
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageConfigFiles,
  PageDataConfig,
  RuleConfig,
} from './editor/page-editor'

export {
  PageConfigLoader,
  createConfigLoader,
} from './editor/page-editor'

export {
  compileRule,
  normalizeRuleNode,
  parseCss,
  parsePageData,
  parseScript,
} from './editor/page-editor'

export {
  PageConfigFileApi,
} from './editor/page-editor'

export type {
  PageConfigFileVersionSummary,
  PageConfigPageSummary,
} from './editor/page-editor'
