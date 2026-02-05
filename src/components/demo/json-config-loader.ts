/**
 * JSON 配置加载器
 * 支持从 JSON 文件加载配置，并注入运行时函数
 */

import type { RenderNode, RenderContext, FieldConfig } from './demo-config'
import type { User } from './types'

/**
 * JSON 配置节点（不包含函数）
 */
export interface JsonConfigNode {
  type: string
  id?: string
  props?: Record<string, unknown>
  class?: string | string[]
  children?: JsonConfigNode[]
  /** 动态子节点生成器名称 */
  _dynamicChildren?: string
  /** 条件渲染函数名称 */
  _condition?: string
  /** 事件处理器映射 */
  _events?: Record<string, string>
}

/**
 * 函数注入器配置
 */
export interface FunctionInjectors {
  /** 子节点生成器 */
  childrenGenerators?: Record<string, (context: RenderContext) => RenderNode[]>
  /** 条件函数 */
  conditions?: Record<string, (context: RenderContext) => boolean>
  /** 事件处理器 */
  events?: Record<string, (data: unknown) => void>
  /** 字段高亮函数 */
  highlights?: Record<string, (value: unknown) => boolean>
}

/**
 * 加载 JSON 配置文件
 */
export async function loadJsonConfig(url: string): Promise<JsonConfigNode> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load config: ${url}`)
  }
  return response.json()
}

/**
 * 将 JSON 配置转换为 RenderNode（注入函数）
 */
export function hydrateConfig(
  jsonNode: JsonConfigNode,
  injectors: FunctionInjectors
): RenderNode {
  const node: RenderNode = {
    type: jsonNode.type,
    id: jsonNode.id,
    props: jsonNode.props,
    class: jsonNode.class
  }

  // 注入子节点生成器
  if (jsonNode._dynamicChildren) {
    const generator = injectors.childrenGenerators?.[jsonNode._dynamicChildren]
    if (generator) {
      node.childrenGenerator = generator
    }
  }

  // 注入条件函数
  if (jsonNode._condition) {
    const condition = injectors.conditions?.[jsonNode._condition]
    if (condition) {
      node.condition = condition
    }
  }

  // 注入事件处理器
  if (jsonNode._events) {
    node.events = {}
    for (const [eventName, handlerName] of Object.entries(jsonNode._events)) {
      const handler = injectors.events?.[handlerName]
      if (handler) {
        node.events[eventName] = handler
      }
    }
  }

  // 递归处理子节点
  if (jsonNode.children) {
    node.children = jsonNode.children.map(child => hydrateConfig(child, injectors))
  }

  return node
}

/**
 * 创建默认函数注入器
 */
export function createDefaultInjectors(_users: User[]): FunctionInjectors {
  return {
    childrenGenerators: {
      // 生成行列表
      generateRows: (context: RenderContext) => {
        return context.users.map(user => ({
          type: 'row',
          id: `row-${user.id}`,
          props: { user },
          children: [
            {
              type: 'field',
              id: `field-name-${user.id}`,
              props: {
                value: user.name,
                label: '姓名',
                icon: '👤'
              }
            },
            {
              type: 'field',
              id: `field-age-${user.id}`,
              props: {
                value: user.age,
                label: '年龄',
                icon: '🎂'
              }
            },
            {
              type: 'field',
              id: `field-email-${user.id}`,
              props: {
                value: user.email,
                label: '邮箱',
                icon: '📧'
              }
            },
            {
              type: 'field',
              id: `field-status-${user.id}`,
              props: {
                value: user.status === 'active' ? '在线' : '离线',
                label: '状态',
                icon: user.status === 'active' ? '🟢' : '🔴',
                highlight: user.status === 'active'
              }
            }
          ]
        }))
      },

      // 生成自定义字段的行
      generateCustomRows: (context: RenderContext) => {
        const fields: FieldConfig[] = context.customFields as FieldConfig[] || []
        return context.users.map(user => ({
          type: 'row',
          id: `row-${user.id}`,
          props: { user },
          children: fields.map(fieldConfig => ({
            type: 'field',
            id: `field-${fieldConfig.field}-${user.id}`,
            props: {
              value: (user as unknown as Record<string, unknown>)[fieldConfig.field],
              label: fieldConfig.label,
              icon: fieldConfig.icon,
              highlight: fieldConfig.highlight ? fieldConfig.highlight((user as unknown as Record<string, unknown>)[fieldConfig.field]) : false
            }
          }))
        }))
      }
    },

    conditions: {
      // 非只读模式
      notReadonly: (context: RenderContext) => !context.readonly,
      
      // 只读模式
      readonly: (context: RenderContext) => !!context.readonly,

      // 有用户数据
      hasUsers: (context: RenderContext) => context.users.length > 0
    },

    events: {
      refresh: () => console.log('🔄 刷新'),
      selectAll: () => console.log('☑️ 全选'),
      clear: () => console.log('❌ 清空'),
      editUser: (data) => console.log('✏️ 编辑:', data),
      deleteUser: (data) => console.log('🗑️ 删除:', data)
    },

    highlights: {
      isActive: (value) => value === 'active',
      isAdult: (value) => typeof value === 'number' && value >= 18
    }
  }
}

/**
 * 从 JSON 文件加载并生成完整配置
 */
export async function loadAndHydrateConfig(
  url: string,
  injectors: FunctionInjectors
): Promise<RenderNode> {
  const jsonConfig = await loadJsonConfig(url)
  return hydrateConfig(jsonConfig, injectors)
}
