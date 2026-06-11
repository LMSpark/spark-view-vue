import { findClassModelToolSpec } from './class-model-tool-specs'

/** 从 ClassModel 工具闭集 schema 派生参数恢复提示，避免业务层硬编码协议字段名。 */
export function buildClassModelToolSchemaRecoveryHint(toolName: string): string | undefined {
  const spec = findClassModelToolSpec(toolName)
  if (spec === undefined) return undefined

  const required = new Set(spec.function.parameters.required ?? [])
  const properties = spec.function.parameters.properties ?? {}
  const parts: string[] = []

  for (const [name, schema] of Object.entries(properties)) {
    if (typeof schema !== 'object') continue
    const description = 'description' in schema && typeof schema.description === 'string'
      ? schema.description
      : ''
    const role = required.has(name) ? 'required' : 'optional'
    parts.push(description.length > 0 ? `${name} (${role}, ${description})` : `${name} (${role})`)
  }

  if (parts.length === 0) return `${toolName} 按工具 schema 重试。`
  return `${toolName} 按工具 schema 重试：{ ${parts.join('; ')} }`
}
