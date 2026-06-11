/**
 * 插件管理系统导出
 * 
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

