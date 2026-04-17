/**
 * 插件管理系统导出
 * 
 * @module @spark-view/spark-app/plugins
 */

export {
  PluginManager,
  createPluginRegister,
  createPluginRegistry,
  getGlobalPluginRegistry
} from './registry'

export {
  registerBuiltinPlugins,
  registerAllPresetPlugins
} from './presets'

export type {
  IPluginRegistry,
  PluginConfigItem,
  PluginConfig,
  PluginLoader,
  PluginInstance
} from './registry'
