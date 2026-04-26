/**
 * 嵌套 Schema 收集器
 * 
 * 用于收集在处理组件 props 过程中发现的需要递归池化的嵌套类型 schema。
 * 例如 ActionsNode.props 中的 RendererActionsConfigProps。
 */

import type { PropSchema } from './component-catalog-schema'

export interface NestedSchemaRecord {
  /** 嵌套类型的完整类型名称（如 "RendererActionsConfigProps" 或 "RendererActionsConfigProps | undefined"） */
  typeName: string
  /** 转换后的 PropSchema */
  schema: PropSchema
}

class NestedSchemaCollector {
  private schemas: Map<string, PropSchema> = new Map()

  private normalizeTypeName(typeName: string): string {
    return typeName
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part !== 'undefined' && part !== 'null')
      .join(' | ')
  }

  /**
   * 记录一个嵌套 schema 类型
   * @param typeName 类型名
   * @param schema PropSchema
   */
  add(typeName: string, schema: PropSchema): void {
    const normalizedTypeName = this.normalizeTypeName(typeName)
    // 使用 typeName 作为 key 去重，同一个类型只需要记录一次
    if (!this.schemas.has(normalizedTypeName)) {
      this.schemas.set(normalizedTypeName, schema)
    }
  }

  /**
   * 获取所有已收集的嵌套 schema 记录
   */
  getAll(): NestedSchemaRecord[] {
    return [...this.schemas.entries()].map(([typeName, schema]) => ({ typeName, schema }))
  }

  /**
   * 清空收集器
   */
  clear(): void {
    this.schemas.clear()
  }

}

// 全局单例收集器
export const nestedSchemaCollector = new NestedSchemaCollector()
