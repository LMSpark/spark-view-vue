/**
 * 插件管理系统导出
 * 
 * @module @spark-view/spark-app/plugins
 */

export {
  PluginRegistry,
  PluginManager,
  createPluginRegister
} from './registry'

export {
  registerBuiltinPlugins,
  registerAllPresetPlugins
} from './presets'

export type {
  PluginConfigItem,
  PluginConfig,
  PluginLoader,
  PluginInstance
} from './registry'
