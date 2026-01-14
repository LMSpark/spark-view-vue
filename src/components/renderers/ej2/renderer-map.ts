/**
 * EJ2 Renderer 组件映射表
 * 将 type 映射到对应的 EJ2 Vue 组件
 */
import type { Component } from 'vue'
import EJ2DateRenderer from './EJ2DateRenderer.vue'
import EJ2NumberRenderer from './EJ2NumberRenderer.vue'
import EJ2TableRenderer from './EJ2TableRenderer.vue'
import EJ2FormRenderer from './EJ2FormRenderer.vue'
import EJ2TextRenderer from './EJ2TextRenderer.vue'
import EJ2StackedColumnRenderer from './EJ2StackedColumnRenderer.vue'

export interface EJ2RendererMap {
  [key: string]: Component
}

/**
 * EJ2 渲染器映射表
 */
export const EJ2_RENDERER_MAP: EJ2RendererMap = {
  // 基础字段类型
  text: EJ2TextRenderer as Component,
  number: EJ2NumberRenderer as Component,
  date: EJ2DateRenderer as Component,
  datetime: EJ2DateRenderer as Component,
  
  // 容器类型
  'ej2-table': EJ2TableRenderer,
  'ej2-grid': EJ2TableRenderer, // 别名
  form: EJ2FormRenderer,
  
  // 特殊列类型
  'ej2-stacked-column': EJ2StackedColumnRenderer,
  'ej2-column-group': EJ2StackedColumnRenderer, // 别名
}

/**
 * 获取指定 type 的 EJ2 渲染器组件
 * @param type 组件类型
 * @returns 对应的 Vue 组件，如果未找到则返回 TextRenderer
 */
export function getEJ2Renderer(type: string): Component {
  return EJ2_RENDERER_MAP[type] || EJ2TextRenderer
}

/**
 * 注册新的 EJ2 渲染器
 * @param type 组件类型
 * @param component Vue 组件
 */
export function registerEJ2Renderer(type: string, component: Component): void {
  EJ2_RENDERER_MAP[type] = component
}
