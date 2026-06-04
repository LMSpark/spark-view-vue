/**
 * 插件管理系统导出
 * 
 * @module @spark-appworks/spark-app/plugins
 */

export {
  PluginManager,
  PluginRegistry,
  createPluginRegister,
  createPluginRegistry,
  getGlobalPluginRegistry
} from './registry'

export {
  registerBuiltinPlugins,
  registerAllPresetPlugins
} from './presets'

export type {
  PluginConfigItem,
  PluginLoader,
  PluginInstance
} from './registry'
