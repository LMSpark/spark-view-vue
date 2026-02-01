// features/renderers/index.ts
// 表单渲染器系统统一导出

// ============ 核心渲染器 ============
export { default as DynamicRenderer } from './components/DynamicRenderer.vue'

// ============ 容器渲染器 ============
export { default as TableRenderer } from './components/TableRenderer.vue'
export { default as FormRenderer } from './components/FormRenderer.vue'
export { default as HtmlRenderer } from './components/HtmlRenderer.vue'

// ============ 基础类型渲染器 ============
export { default as TextRenderer } from './components/TextRenderer.vue'
export { default as NumberRenderer } from './components/NumberRenderer.vue'
export { default as DateRenderer } from './components/DateRenderer.vue'

// ============ VXE 渲染器 ============
export { default as VxeTableRenderer } from './components/vxe/VxeTableRenderer.vue'

// ============ 渲染器映射 ============
export {
  getRenderer,
  registerRenderer,
  registerRenderers,
  isContainerType,
  type RendererMap
} from './components/renderer-map'

// ============ 演示示例 ============
export { default as RendererDemo } from './examples/RendererDemo.vue'

/**
 * 表单渲染器系统
 * 
 * 基于 Vue 3 + SLOT 递归架构的动态渲染系统
 * 
 * 核心特性:
 * - 统一 SLOT 接口
 * - 作用域 slot 支持
 * - 递归渲染能力
 * - 上下文感知
 * - 灵活扩展
 * 
 * 使用方式:
 * ```ts
 * import { DynamicRenderer, getRenderer } from '@/features/renderers'
 * 
 * // 使用动态渲染器
 * <DynamicRenderer :config="config" :data="data" />
 * 
 * // 获取特定渲染器
 * const TableComp = getRenderer('table')
 * ```
 */
