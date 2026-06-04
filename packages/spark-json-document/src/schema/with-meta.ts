/**
 * schema/with-meta.ts — JSON Schema 节点添加 title/description 元数据
 */

type JsonSchemaNode = {
  [key: string]: unknown
}

/** 为 JSON Schema 节点合并 title 和 description 元数据 */
export function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}
