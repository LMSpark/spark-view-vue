/**
 * SPARK 组件加载器模块
 * 
 * @module Loader
 * @description
 * 提供智能组件加载、自动注册和按需加载功能
 */

export { AutoLoader, createAutoLoader } from './auto-loader'
export type { AutoLoaderConfig, ComponentMetadata, LoadStrategy } from './auto-loader'
