/**
 * Demo 组件配置化渲染配置
 */

import type { User } from './types'

/**
 * 渲染配置节点
 */
export interface RenderNode {
  /** 组件类型 */
  type: 'grid' | 'row' | 'field' | 'container' | string
  /** 组件 ID */
  id?: string
  /** 组件 props */
  props?: Record<string, unknown>
  /** 子节点 */
  children?: RenderNode[]
  /** 子节点生成器（动态生成） */
  childrenGenerator?: (context: RenderContext) => RenderNode[]
  /** 条件渲染 */
  condition?: (context: RenderContext) => boolean
  /** 样式类 */
  class?: string | string[]
  /** 事件处理 */
  events?: Record<string, (data: unknown) => void>
}

/**
 * 渲染上下文
 */
export interface RenderContext {
  users: User[]
  [key: string]: unknown
}

/**
 * 字段配置
 */
export interface FieldConfig {
  field: string
  label: string
  icon: string
  highlight?: (value: unknown) => boolean
}

/**
 * 网格配置
 */
export interface GridConfig {
  fields: FieldConfig[]
  showCheckbox?: boolean
  showActions?: boolean
}

/**
 * 创建默认字段配置
 */
export const defaultFields: FieldConfig[] = [
  { field: 'name', label: '姓名', icon: '👤' },
  { field: 'age', label: '年龄', icon: '🎂' },
  { field: 'email', label: '邮箱', icon: '📧' },
  { 
    field: 'status', 
    label: '状态', 
    icon: '🔔',
    highlight: (value) => value === 'active'
  }
]

/**
 * 创建渲染配置
 */
export function createDemoConfig(users: User[], config?: Partial<GridConfig>): RenderNode {
  const fields = config?.fields || defaultFields
  const showCheckbox = config?.showCheckbox !== false
  const showActions = config?.showActions !== false

  return {
    type: 'grid',
    id: 'user-grid',
    props: { users },
    children: [
      // Header
      {
        type: 'container',
        class: 'grid-header',
        children: [
          {
            type: 'container',
            class: 'grid-title',
            props: { text: '👥 用户列表' }
          },
          ...(showActions ? [{
            type: 'container',
            class: 'grid-actions',
            children: [
              { type: 'container', props: { text: '🔄 刷新', action: 'refresh' } },
              { type: 'container', props: { text: '☑️ 全选', action: 'selectAll' } },
              { type: 'container', props: { text: '❌ 清空', action: 'clearSelection' } },
              { type: 'container', props: { text: '🏠 首页', action: 'navigateHome' } }
            ]
          }] : [])
        ]
      },
      // Rows (动态生成)
      {
        type: 'container',
        class: 'grid-body',
        childrenGenerator: (context) => {
          return context.users.map((user: User) => ({
            type: 'row',
            id: `row-${user.id}`,
            props: { user },
            children: [
              // Checkbox
              ...(showCheckbox ? [{
                type: 'container',
                class: 'row-checkbox',
                props: { user }
              }] : []),
              // Fields
              ...fields.map(fieldConfig => ({
                type: 'field',
                id: `field-${fieldConfig.field}-${user.id}`,
                props: {
                  value: (user as unknown as Record<string, unknown>)[fieldConfig.field],
                  label: fieldConfig.label,
                  icon: fieldConfig.icon,
                  highlight: fieldConfig.highlight ? fieldConfig.highlight((user as unknown as Record<string, unknown>)[fieldConfig.field]) : false
                }
              }))
            ]
          }))
        }
      }
    ]
  }
}

/**
 * 简化配置 - 只需提供数据
 */
export function createSimpleConfig(users: User[]): RenderNode {
  return createDemoConfig(users)
}

/**
 * 自定义字段配置
 */
export function createCustomFieldsConfig(users: User[], fields: FieldConfig[]): RenderNode {
  return createDemoConfig(users, { fields })
}

/**
 * 无操作按钮配置
 */
export function createReadOnlyConfig(users: User[]): RenderNode {
  return createDemoConfig(users, { showActions: false, showCheckbox: false })
}
