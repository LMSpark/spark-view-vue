import { createChecker } from 'vue-component-meta'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve('.')
const checker = createChecker(resolve(root, 'tsconfig.catalog.json'))

// 扫描所有 renderer 组件（与 catalog generator 同范围）
import { globSync } from 'glob'

const patterns = [
  './packages/spark-component/src/renderer/containers/*.vue',
  './packages/spark-component/src/renderer/fields/*.vue',
]

interface Target { name: string; path: string }
const targets: Target[] = []

for (const pattern of patterns) {
  const files = globSync(pattern, { cwd: root, absolute: false })
  for (const file of files) {
    const fileName = file.split('/').pop()!.replace('.vue', '')
    // 转 kebab-case
    const kebab = fileName
      .replace(/^Renderer/, '')
      .replace(/^Field/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
    const type = fileName.startsWith('Renderer') || fileName.startsWith('Field')
      ? `r-${kebab}`
      : kebab
    targets.push({ name: type, path: file })
  }
}

console.log(`Scanning ${targets.length} components...`)

const dump: Record<string, unknown> = {}

for (const t of targets) {
  const abs = resolve(root, t.path).replace(/\\/g, '/')
  try {
    const meta = checker.getComponentMeta(abs)
    const nonGlobalProps = meta.props.filter((p: any) => !p.global)
    dump[t.name] = {
      filePath: t.path,
      propsCount: nonGlobalProps.length,
      props: nonGlobalProps.map((p: any) => {
        const entry: Record<string, unknown> = {
          name: p.name,
          type: p.type,
          required: p.required,
        }
        if (p.default !== undefined && p.default !== '') entry.default = p.default
        if (p.description) entry.description = p.description.substring(0, 300)

        // schema 摘要（不做 convertSchema 转换，直接输出原始结构信息）
        if (p.schema && typeof p.schema !== 'string') {
          entry.schemaKind = p.schema.kind
          entry.schemaType = p.schema.type

          if (p.schema.kind === 'object' && p.schema.schema) {
            const keys = Object.keys(p.schema.schema)
            entry.schemaPropertyCount = keys.length
            entry.schemaPropertyNames = keys.slice(0, 30)
            // 标记巨型类型
            if (keys.length > 50) entry._WARNING = `BLOATED: ${keys.length} properties`
          }

          if (p.schema.kind === 'enum' && p.schema.schema) {
            entry.schemaVariantCount = p.schema.schema.length
            entry.schemaVariantSamples = p.schema.schema
              .slice(0, 15)
              .map((s: any) => (typeof s === 'string' ? s : s.type))
          }

          if (p.schema.kind === 'array' && p.schema.schema) {
            entry.schemaArrayItemCount = p.schema.schema.length
            entry.schemaArrayItemTypes = p.schema.schema
              .slice(0, 5)
              .map((s: any) => (typeof s === 'string' ? s : s.type))
          }
        }

        return entry
      }),
      eventsCount: meta.events.length,
      events: meta.events.map((e: any) => ({
        name: e.name,
        type: e.type,
        description: (e.description ?? '').substring(0, 200) || undefined,
      })),
      slotsCount: meta.slots.length,
      slots: meta.slots.map((s: any) => ({
        name: s.name,
        type: s.type,
        description: (s.description ?? '').substring(0, 200) || undefined,
      })),
      exposedCount: meta.exposed.filter((e: any) => !['$slots', '$emit', '$props', '$data', '$options', '$refs', '$el', '$attrs', '$forceUpdate', '$nextTick', '$watch', '$parent', '$root'].includes(e.name)).length,
    }
    console.log(`  ✓ ${t.name}: ${nonGlobalProps.length} props, ${meta.events.length} events`)
  } catch (e: any) {
    dump[t.name] = { error: e.message, filePath: t.path }
    console.log(`  ✗ ${t.name}: ${e.message}`)
  }
}

writeFileSync('temp-vcm-raw-dump.json', JSON.stringify(dump, null, 2))
console.log(`\nDone. ${Object.keys(dump).length} components → temp-vcm-raw-dump.json`)
