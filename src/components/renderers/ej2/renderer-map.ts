/**
 * EJ2 Renderer 组件映射表
 * 将 type 映射到对应的 EJ2 Vue 组件
 */
import type { Component } from 'vue'
import TextRenderer from './TextRenderer.vue'
import NumberRenderer from './NumberRenderer.vue'
import DateRenderer from './DateRenderer.vue'
import TableRenderer from './TableRenderer.vue'
import FormRenderer from './FormRenderer.vue'

export interface EJ2RendererMap {
  [key: string]: Component
}

/**
 * EJ2 渲染器映射表
 */
export const EJ2_RENDERER_MAP: EJ2RendererMap = {
  // 基础字段类型
  text: TextRenderer as Component,
  number: NumberRenderer as Component,
  date: DateRenderer as Component,
  datetime: DateRenderer as Component,
  
  // 容器类型
  'ej2-table': TableRenderer,
  'ej2-grid': TableRenderer, // 别名
  form: FormRenderer,
}

/**
 * 获取指定 type 的 EJ2 渲染器组件
 * @param type 组件类型
 * @returns 对应的 Vue 组件，如果未找到则返回 TextRenderer
 */
export function getEJ2Renderer(type: string): Component {
  return EJ2_RENDERER_MAP[type] || TextRenderer
}

/**
 * 注册新的 EJ2 渲染器
 * @param type 组件类型
 * @param component Vue 组件
 */
export function registerEJ2Renderer(type: string, component: Component): void {
  EJ2_RENDERER_MAP[type] = component
}
