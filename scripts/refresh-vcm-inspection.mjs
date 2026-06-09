import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createClassModelDocumentFromRuntimeDocument,
  readModuleMetadataRuntimeDocument,
  resolveModuleMetadataJson,
  walkAiApiMetadataGraph,
} from '../packages/spark-ai/src/vcm-native/index.ts'
import {
  renderAttributeDeclarationLine,
  renderConstructorSignature,
  renderMethodSignature,
} from '../packages/spark-ai/src/vcm-native/class-model/signature-renderer.ts'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, '.cursor/inspection')
mkdirSync(outDir, { recursive: true })

const runtimePath = resolve(root, 'src/services/page-design/page-design-module-metadata.runtime.generated.json')
const jsdocTodoPath = resolve(root, 'src/services/page-design/page-design-module-metadata.jsdoc-todo.generated.json')

const raw = JSON.parse(readFileSync(runtimePath, 'utf8'))
writeFileSync(
  resolve(outDir, 'page-design-module-metadata.runtime.pretty.json'),
  `${JSON.stringify(raw, null, 2)}\n`,
  'utf8',
)

const runtime = readModuleMetadataRuntimeDocument(raw)
const classModel = createClassModelDocumentFromRuntimeDocument(raw)
writeFileSync(
  resolve(outDir, 'page-design-class-model.pretty.json'),
  `${JSON.stringify(classModel, null, 2)}\n`,
  'utf8',
)

const jsdocTodo = JSON.parse(readFileSync(jsdocTodoPath, 'utf8'))
const rootModule = runtime.modules[0]
if (rootModule === undefined) throw new Error('runtime module missing')
const resolvedModule = resolveModuleMetadataJson(rootModule, {
  schemaDefs: raw.$defs,
})
const metadataGraph = walkAiApiMetadataGraph(resolvedModule.rootApi)
const resultApiEdges = metadataGraph.flatMap(node =>
  node.edges
    .filter(edge => edge.via === 'action')
    .map(edge => ({
      from: `${edge.parentKind}.${edge.viaName}`,
      to: edge.child.kind,
      className: edge.child.className,
    })),
)

const uniqueEdges = [...new Map(resultApiEdges.map(edge => [`${edge.from}->${edge.to}`, edge])).values()]
  .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

const kinds = Object.keys(classModel.models).sort()
const evaluation = {
  generatedAt: new Date().toISOString(),
  sources: {
    runtime: 'src/services/page-design/page-design-module-metadata.runtime.generated.json',
    jsdocTodo: 'src/services/page-design/page-design-module-metadata.jsdoc-todo.generated.json',
  },
  runtimeEnvelope: {
    schemaVersion: runtime.schemaVersion,
    defsCount: Object.keys(raw.$defs ?? {}).length,
    apiRegistryKinds: Object.keys(runtime.modules[0]?.apiRegistry ?? {}).sort(),
    rootKind: runtime.modules[0]?.rootApi.kind,
  },
  classModelEnvelope: {
    schemaVersion: classModel.schemaVersion,
    rootKind: classModel.rootKind,
    modelKinds: kinds,
    diagnostics: classModel.diagnostics,
    jsdocShape: typeof classModel.models['project']?.jsdoc,
  },
  jsdocTodo: jsdocTodo.summary,
  coverage: {
    attributeCount: Object.values(classModel.models).reduce((n, m) => n + m.attributes.length, 0),
    methodCount: Object.values(classModel.models).reduce((n, m) => n + m.methods.length, 0),
    methodCounts: Object.fromEntries(kinds.map(kind => [kind, classModel.models[kind].methods.length])),
    attributeCounts: Object.fromEntries(kinds.map(kind => [kind, classModel.models[kind].attributes.length])),
  },
  resultApiGraph: {
    uniqueEdgeCount: uniqueEdges.length,
    rawEdgeCount: resultApiEdges.length,
    uniqueEdges,
  },
}

writeFileSync(
  resolve(outDir, 'vcm-knowledge-evaluation.pretty.json'),
  `${JSON.stringify(evaluation, null, 2)}\n`,
  'utf8',
)

const lines = []
const log = (s = '') => lines.push(s)
log('=== VCM 知识体系 (ClassModel) ===')
log(`rootKind: ${classModel.rootKind}`)
log(`models: ${kinds.join(', ')}`)
log(`diagnostics: ${classModel.diagnostics.length}`)
log('')

for (const kind of kinds) {
  const model = classModel.models[kind]
  log(`## ${kind} (${model.className})`)
  log(model.jsdoc.trim())
  if (model.constructor) {
    log(`constructor: ${renderConstructorSignature(model.constructor)}`)
  }
  log(`attributes (${model.attributes.length}):`)
  for (const attr of model.attributes) {
    log(`  - ${renderAttributeDeclarationLine(classModel, attr)}`)
  }
  log(`methods (${model.methods.length}):`)
  for (const method of model.methods) {
    log(`  - ${renderMethodSignature(classModel, method)}`)
  }
  log('')
}

writeFileSync(resolve(outDir, 'vcm-knowledge-print.txt'), `${lines.join('\n')}\n`, 'utf8')

console.log(JSON.stringify({
  outDir,
  files: [
    'page-design-module-metadata.runtime.pretty.json',
    'page-design-class-model.pretty.json',
    'vcm-knowledge-evaluation.pretty.json',
    'vcm-knowledge-print.txt',
  ],
  runtimeJsdocType: typeof runtime.modules[0]?.rootApi.actions[0]?.jsdoc,
  classModelJsdocType: typeof classModel.models['project']?.jsdoc,
}, null, 2))
