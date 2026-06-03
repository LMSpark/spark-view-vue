/** JSON Schema 节点添加 title/description 元数据的工具函数。 */

type JsonSchemaNode = {
  [key: string]: unknown
}

export function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}
