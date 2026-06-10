import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createClassModelDocumentFromRuntimeDocument,
  listAttributeReachableKinds,
  projectClassModelForGuide,
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

const runtimePath = resolve(root, 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json')
const jsdocTodoPath = resolve(root, 'generated/vcm/project-page-surface/project-page-surface-module-metadata.jsdoc-todo.generated.json')
const manifestPath = resolve(root, 'generated/vcm/project-page-surface/manifest.json')

const raw = JSON.parse(readFileSync(runtimePath, 'utf8'))
writeFileSync(
  resolve(outDir, 'page-design-module-metadata.runtime.pretty.json'),
  `${JSON.stringify(raw, null, 2)}\n`,
  'utf8',
)

const runtime = readModuleMetadataRuntimeDocument(raw)
const classModelDocument = createClassModelDocumentFromRuntimeDocument(raw)
writeFileSync(
  resolve(outDir, 'page-design-class-model.pretty.json'),
  `${JSON.stringify(classModelDocument, null, 2)}\n`,
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

const attributeReachableKinds = listAttributeReachableKinds(classModelDocument)
const attributeApiEdges = []
for (const kind of attributeReachableKinds) {
  const api = kind === classModelDocument.rootKind
    ? classModelDocument.module.rootApi
    : classModelDocument.module.apiRegistry?.[kind]
  for (const attribute of api?.attributes ?? []) {
    const childKind = attribute.api?.kind
    if (childKind === undefined || childKind.length === 0) continue
    attributeApiEdges.push({
      from: `${kind}.${attribute.name}`,
      to: childKind,
    })
  }
}

const evaluation = {
  generatedAt: new Date().toISOString(),
  sources: {
    runtime: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
    manifest: 'generated/vcm/project-page-surface/manifest.json',
    jsdocTodo: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.jsdoc-todo.generated.json',
  },
  runtimeEnvelope: {
    schemaVersion: runtime.schemaVersion,
    defsCount: Object.keys(raw.$defs ?? {}).length,
    apiRegistryKinds: Object.keys(runtime.modules[0]?.apiRegistry ?? {}).sort(),
    rootKind: runtime.modules[0]?.rootApi.kind,
  },
  classModelEnvelope: {
    schemaVersion: classModelDocument.schemaVersion,
    rootKind: classModelDocument.rootKind,
    attributeReachableKinds,
    jsdocShape: typeof classModelDocument.module.rootApi.jsdoc,
  },
  jsdocTodo: jsdocTodo.summary,
  coverage: {
    attributeReachableModelCount: attributeReachableKinds.length,
    projectedModels: Object.fromEntries(attributeReachableKinds.map(kind => {
      const model = projectClassModelForGuide(classModelDocument, kind)
      return [kind, {
        attributeCount: model.attributes.length,
        methodCount: model.methods.length,
      }]
    })),
  },
  attributeApiGraph: {
    edgeCount: attributeApiEdges.length,
    edges: attributeApiEdges,
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
log('=== VCM 知识体系（ClassModel 按需投影）===')
log(`rootKind: ${classModelDocument.rootKind}`)
log(`attributeReachableKinds: ${attributeReachableKinds.join(', ')}`)
log('')

for (const kind of attributeReachableKinds) {
  const model = projectClassModelForGuide(classModelDocument, kind)
  log(`## ${kind} (${model.className})`)
  log(model.jsdoc.trim())
  if (model.constructor) {
    log(`constructor: ${renderConstructorSignature(model.constructor)}`)
  }
  log(`attributes (${model.attributes.length}):`)
  for (const attr of model.attributes) {
    log(`  - ${renderAttributeDeclarationLine(classModelDocument, kind, attr)}`)
  }
  log(`methods (${model.methods.length}):`)
  for (const method of model.methods) {
    log(`  - ${renderMethodSignature(classModelDocument, kind, method)}`)
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
  attributeReachableKinds,
  attributeApiEdgeCount: attributeApiEdges.length,
  resultApiUniqueEdgeCount: uniqueEdges.length,
}, null, 2))
