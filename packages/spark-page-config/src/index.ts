/**
 * @spark-view/spark-page-config
 *
 * Package root keeps only the minimal config-loader runtime API. Feature
 * consumers use explicit subpaths including page/loading, page/model,
 * page/workspace, page/navigation, page/sandbox, page/services, and
 * assistant/registrations.
 */

export {
  BasePageConfigLoader,
  PageConfigLoader,
  createConfigLoader,
} from './page/loading'

export type {
  ConfigLoaderOptions,
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageConfigFiles,
} from './page/loading'
