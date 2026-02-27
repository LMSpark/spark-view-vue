/**
 * @spark-view/spark-data/utils — 工具函数子路径导出
 */
export { isSameRow, getParentRows, buildPkSet, pruneInvalidSelections } from './core/utils'
export { resolveUrlTemplate } from './core/url-template'
export type { ResolvedUrl } from './core/url-template'
export {
  PrimaryKeyGenerator,
  createPrimaryKeyGenerator,
  createSnowflakeGenerator
} from './core/primary-key-generator'
export type {
  PrimaryKeyStrategy,
  PrimaryKeyGeneratorConfig
} from './core/primary-key-generator'
