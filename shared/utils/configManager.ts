// Re-export configuration utilities from the canonical package to avoid duplication
export { setConfig, getConfig, clearConfig, ConfigManager } from '@spark-view/spark-core'

export const watchConfig = ConfigManager.watch.bind(ConfigManager)
export const deleteConfig = ConfigManager.delete.bind(ConfigManager)
export const hasConfig = ConfigManager.has.bind(ConfigManager)