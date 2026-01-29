// src/utils/componentRegistry.ts

/**
 * SPARK 组件注册表 - 实现组件完全解耦
 * 每个组件只依赖公共逻辑，不得依赖其他自定义组件
 */

import type { Component } from 'vue'

// 组件注册表类型
interface ComponentRegistry {
  [componentType: string]: Component
}

// 全局组件注册表
const componentRegistry: ComponentRegistry = {}

/**
 * 注册组件到全局注册表
 * @param type 组件类型
 * @param component Vue组件
 */
export function registerSparkComponent(type: string, component: Component): void {
  if (componentRegistry[type]) {
    console.warn(`⚠️ SPARK Component '${type}' is already registered. Overwriting...`)
  }
  componentRegistry[type] = component
  console.log(`📝 Registered SPARK Component: ${type}`)
}

/**
 * 从注册表获取组件
 * @param type 组件类型
 * @returns Vue组件或undefined
 */
export function getSparkComponent(type: string): Component | undefined {
  return componentRegistry[type]
}

/**
 * 获取所有已注册的组件类型
 * @returns 组件类型数组
 */
export function getRegisteredComponentTypes(): string[] {
  return Object.keys(componentRegistry)
}

/**
 * 检查组件类型是否已注册
 * @param type 组件类型
 * @returns 是否已注册
 */
export function isComponentRegistered(type: string): boolean {
  return type in componentRegistry
}

/**
 * 批量注册组件
 * @param components 组件映射对象
 */
export function registerSparkComponents(components: Record<string, Component>): void {
  Object.entries(components).forEach(([type, component]) => {
    registerSparkComponent(type, component)
  })
}