/**
 * @spark-view/spark-page-config
 *
 * Package root keeps only the minimal runtime config-loader API. Feature
 * consumers use explicit subpaths: config, node-tree, navigation, runtime,
 * json-document, design, and ai.
 */

export {
  BasePageConfigLoader,
} from './config/config-load-api'

export {
  PageConfigLoader,
  createConfigLoader,
} from './config/page-config-loader'

export type {
  ConfigLoaderOptions,
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageConfigFiles,
} from './config/config-load-api'
