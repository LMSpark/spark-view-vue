const { createChecker } = require('vue-component-meta')

const checker = createChecker('./tsconfig.catalog.json', { schema: true })

const meta = checker.getComponentMeta(
  'd:/SPARK_VIEW/packages/spark-component/src/components/containers/RendererFilter.vue'
)

const colProp = meta.props.find(p => p.name === 'columns')
if (!colProp) { console.log('columns prop not found'); process.exit(1) }

console.log('=== columns prop ===')
console.log('type:', colProp.type)
console.log('required:', colProp.required)
console.log('')

function safeSerialize(obj, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return '"[MAX_DEPTH]"'
  if (obj === null || obj === undefined) return String(obj)
  if (typeof obj === 'string') return JSON.stringify(obj)
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)
  if (typeof obj === 'function') return '"[Function]"'

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => safeSerialize(item, depth + 1, maxDepth)).join(', ') + ']'
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).filter(k => !k.startsWith('_') && typeof obj[k] !== 'function')
    const entries = keys.map(k => {
      try {
        return JSON.stringify(k) + ': ' + safeSerialize(obj[k], depth + 1, maxDepth)
      } catch {
        return JSON.stringify(k) + ': "[CIRCULAR]"'
      }
    })
    return '{\n' + '  '.repeat(depth + 1) + entries.join(',\n' + '  '.repeat(depth + 1)) + '\n' + '  '.repeat(depth) + '}'
  }

  return String(obj)
}

console.log('schema:')
console.log(safeSerialize(colProp.schema, 0, 10))
