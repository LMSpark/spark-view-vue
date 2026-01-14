/**
 * Renderer 组件映射表
 * 将 type 映射到对应的 Vue 组件
 */
import type { Component } from 'vue'
// 使用默认导入方式确保组件正确加载
import TextRenderer from './TextRenderer.vue'
import NumberRenderer from './NumberRenderer.vue'
import DateRenderer from './DateRenderer.vue'
import TableRenderer from './TableRenderer.vue'
import FormRenderer from './FormRenderer.vue'
import HtmlRenderer from './HtmlRenderer.vue'
// EJ2 组件
import EJ2TableRenderer from './ej2/EJ2TableRenderer.vue'
import EJ2ColumnRenderer from './ej2/EJ2ColumnRenderer.vue'

export interface RendererMap {
  [key: string]: Component
}

/**
 * 基础类型渲染器
 * 注意：TextRenderer/NumberRenderer/DateRenderer 使用 <script setup> 导出
 */
export const RENDERER_MAP: RendererMap = {
  // 基础字段类型
  text: TextRenderer as Component,
  number: NumberRenderer as Component,
  date: DateRenderer as Component,
  datetime: DateRenderer as Component,
  
  // 容器类型
  table: TableRenderer,
  form: FormRenderer,
  
  // EJ2 组件
  'ej2-table': EJ2TableRenderer,
  'ej2-grid': EJ2TableRenderer,
  'ej2-column': EJ2ColumnRenderer,
  'ej2-stacked-column': EJ2ColumnRenderer,  // 使用同一个渲染器，内部判断
  'ej2-column-group': EJ2ColumnRenderer,
  
  // HTML 元素（通用渲染器）
  div: HtmlRenderer,
  h1: HtmlRenderer,
  h2: HtmlRenderer,
  h3: HtmlRenderer,
  p: HtmlRenderer,
  span: HtmlRenderer,
  section: HtmlRenderer,
}

/**
 * 获取指定 type 的渲染器组件
 * @param type 组件类型
 * @returns 对应的 Vue 组件，如果未找到则返回 TextRenderer
 */
export function getRenderer(type: string): Component {
  return RENDERER_MAP[type] || TextRenderer
}

/**
 * 注册自定义渲染器
 * @param type 类型名称
 * @param component Vue 组件
 */
export function registerRenderer(type: string, component: Component): void {
  RENDERER_MAP[type] = component
}

/**
 * 批量注册渲染器
 * @param renderers 类型到组件的映射对象
 */
export function registerRenderers(renderers: RendererMap): void {
  Object.assign(RENDERER_MAP, renderers)
}

/**
 * 检查是否为容器类型（需要递归渲染子节点）
 * @param type 类型名称
 */
export function isContainerType(type: string): boolean {
  return [
    'table', 
    'form', 
    'div', 
    'section', 
    'container', 
    'el-card', 
    'el-row', 
    'el-col',
    'ej2-table',
    'ej2-grid'
  ].includes(type)
}
