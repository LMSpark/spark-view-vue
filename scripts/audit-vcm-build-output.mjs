import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { findMissingJsonSchemaDefRefs } from '@spark-appworks/spark-json-document'
import {
  compareClassModelDocumentsForBuildConsistency,
  createClassModelDocumentFromRuntimeDocument,
  readModuleMetadataRuntimeDocument,
  resolveModuleMetadataJson,
  validateApiObjectMetadata,
  walkAiApiMetadataGraph,
  renderMethodSignature,
} from '../packages/spark-ai/src/vcm-native/index.ts'

const root = resolve(import.meta.dirname, '..')
const runtimePath = resolve(root, 'src/services/page-design/page-design-module-metadata.runtime.generated.json')
const raw = JSON.parse(readFileSync(runtimePath, 'utf8'))
const runtime = readModuleMetadataRuntimeDocument(raw)
const classModel = createClassModelDocumentFromRuntimeDocument(raw)
const resolved = resolveModuleMetadataJson(runtime.modules[0], { schemaDefs: raw.$defs })

const issues = []

function fail(code, message) {
  issues.push({ level: 'error', code, message })
}

function warn(code, message) {
  issues.push({ level: 'warning', code, message })
}

// 1. Runtime envelope
if (runtime.schemaVersion !== 2) fail('RUNTIME_SCHEMA_VERSION', `expected 2, got ${runtime.schemaVersion}`)
if (runtime.modules.length !== 1) fail('RUNTIME_MODULE_COUNT', `expected 1 module, got ${runtime.modules.length}`)

const module = runtime.modules[0]
const registryKinds = Object.keys(module.apiRegistry ?? {}).sort()
const expectedRegistry = ['config-page', 'data-table', 'data-view', 'dataset', 'node-tree']
if (registryKinds.join(',') !== expectedRegistry.join(',')) {
  fail('API_REGISTRY_KINDS', `registry mismatch: ${registryKinds.join(',')}`)
}
if (module.rootApi.kind !== 'project') fail('ROOT_KIND', `expected project, got ${module.rootApi.kind}`)

// 2. $defs refs
const missingDefs = findMissingJsonSchemaDefRefs(raw)
if (missingDefs.length > 0) fail('MISSING_DEFS', `missing $defs: ${missingDefs.join(', ')}`)

// 3. validate root API
try {
  validateApiObjectMetadata(resolved.rootApi)
} catch (error) {
  fail('VALIDATE_ROOT_API', String(error))
}

// 4. ClassModel projection
if (classModel.diagnostics.length > 0) {
  fail('CLASS_MODEL_DIAGNOSTICS', JSON.stringify(classModel.diagnostics))
}
const modelKinds = Object.keys(classModel.models).sort()
if (modelKinds.join(',') !== [...expectedRegistry, 'project'].sort().join(',')) {
  fail('CLASS_MODEL_KINDS', modelKinds.join(','))
}

// 5. Member count parity runtime vs ClassModel
const apisByKind = new Map([[module.rootApi.kind, module.rootApi], ...Object.entries(module.apiRegistry ?? {})])
for (const [kind, api] of apisByKind) {
  const model = classModel.models[kind]
  if (model === undefined) {
    fail('MISSING_CLASS_MODEL', kind)
    continue
  }
  if (api.actions.length !== model.methods.length) {
    fail('METHOD_COUNT_MISMATCH', `${kind}: runtime=${api.actions.length} classModel=${model.methods.length}`)
  }
  if ((api.attributes ?? []).length !== model.attributes.length) {
    fail('ATTRIBUTE_COUNT_MISMATCH', `${kind}: runtime=${(api.attributes ?? []).length} classModel=${model.attributes.length}`)
  }
}

// 6. Forbidden legacy shapes
const serialized = JSON.stringify(classModel)
for (const forbidden of ['childModels', 'vcmCatalog', 'callbackApis', '"signature"', '"declaration"', '"typeText"', '"usageRules"', '"failureModes"']) {
  if (serialized.includes(forbidden)) warn('LEGACY_FIELD_IN_CLASS_MODEL', forbidden)
}

// 7. jsdoc shape in runtime
function checkJsdocShape(api, path) {
  if (api.jsdoc !== undefined && typeof api.jsdoc !== 'string') {
    fail('JSDOC_NOT_STRING', `${path}.jsdoc is ${typeof api.jsdoc}`)
  }
  for (const action of api.actions) {
    if (action.jsdoc !== undefined && typeof action.jsdoc !== 'string') {
      fail('JSDOC_NOT_STRING', `${path}.actions.${action.name}.jsdoc`)
    }
  }
  for (const attr of api.attributes ?? []) {
    if (attr.jsdoc !== undefined && typeof attr.jsdoc !== 'string') {
      fail('JSDOC_NOT_STRING', `${path}.attributes.${attr.name}.jsdoc`)
    }
  }
}
checkJsdocShape(module.rootApi, 'rootApi')
for (const [kind, api] of Object.entries(module.apiRegistry ?? {})) {
  checkJsdocShape(api, `apiRegistry.${kind}`)
}

// 8. returnsKind / callbackTargetKind vs resultApis
const graph = walkAiApiMetadataGraph(resolved.rootApi)
const uniqueEdges = new Map()
for (const node of graph) {
  for (const edge of node.edges.filter(e => e.via === 'action')) {
    uniqueEdges.set(`${edge.parentKind}.${edge.viaName}->${edge.child.kind}`, edge)
  }
}
for (const [kind, model] of Object.entries(classModel.models)) {
  const api = apisByKind.get(kind)
  if (api === undefined) continue
  for (const method of model.methods) {
    const action = api.actions.find(a => a.name === method.name)
    if (action === undefined) continue
    const hasRun = action.paramsSchema?.required?.includes('run') === true
    if (hasRun) {
      if (method.callbackTargetKind === undefined) {
        warn('CALLBACK_KIND_MISSING', `${kind}.${method.name} has run param but no callbackTargetKind`)
      }
    } else {
      const returnRef = (action.resultApis ?? []).find(ref => (ref.resultPath ?? []).length === 0)
      if (returnRef !== undefined && method.returnsKind === undefined) {
        warn('RETURNS_KIND_MISSING', `${kind}.${method.name} has resultApi return but no returnsKind`)
      }
    }
    if (method.returnsKind !== undefined || method.callbackTargetKind !== undefined) {
      const sig = renderMethodSignature(classModel, method)
      if (sig.includes('unknown') && !sig.includes('AnonSchema')) {
        warn('SIGNATURE_UNKNOWN', `${kind}.${method.name}: ${sig}`)
      }
    }
  }
}

// 9. ClassModel self-consistency
const selfIssues = compareClassModelDocumentsForBuildConsistency(classModel, classModel)
if (selfIssues.length > 0) fail('CLASS_MODEL_SELF_CONSISTENCY', JSON.stringify(selfIssues))

// 10. Summary stats
const stats = {
  defsCount: Object.keys(raw.$defs ?? {}).length,
  methodCount: Object.values(classModel.models).reduce((n, m) => n + m.methods.length, 0),
  attributeCount: Object.values(classModel.models).reduce((n, m) => n + m.attributes.length, 0),
  uniqueResultApiEdges: uniqueEdges.size,
  classModelDiagnostics: classModel.diagnostics.length,
  auditIssues: issues.length,
}

console.log(JSON.stringify({ ok: issues.filter(i => i.level === 'error').length === 0, stats, issues }, null, 2))
process.exit(issues.filter(i => i.level === 'error').length === 0 ? 0 : 1)
