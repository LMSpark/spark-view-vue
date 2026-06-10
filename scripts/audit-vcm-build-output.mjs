import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { findMissingJsonSchemaDefRefs } from '../packages/spark-json-document/src/schema/schema-defs.ts'
import {
  auditClassModelReflectionConnectivity,
  collectModuleApiKinds,
  compareClassModelDocumentsForBuildConsistency,
  createClassModelDocumentFromRuntimeDocument,
  listAttributeReachableKinds,
  projectClassModelFromApi,
  readModuleMetadataRuntimeDocument,
  resolveModuleApi,
  resolveModuleMetadataJson,
  validateApiObjectMetadata,
  walkAiApiMetadataGraph,
} from '../packages/spark-ai/src/vcm-native/index.ts'
import { renderMethodSignature } from '../packages/spark-ai/src/vcm-native/class-model/signature-renderer.ts'

const root = resolve(import.meta.dirname, '..')
const runtimePath = resolve(root, 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json')
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

// 4. ClassModel 按需投影（document 只存 module，不预存 models）
const modelKinds = collectModuleApiKinds(classModel.module).sort()
if (modelKinds.join(',') !== [...expectedRegistry, 'project'].sort().join(',')) {
  fail('CLASS_MODEL_KINDS', modelKinds.join(','))
}

// 5. Member count parity runtime vs on-demand projection
const apisByKind = new Map([[module.rootApi.kind, module.rootApi], ...Object.entries(module.apiRegistry ?? {})])
for (const [kind, api] of apisByKind) {
  const model = projectClassModelFromApi(resolveModuleApi(classModel, kind))
  if (api.actions.length !== model.methods.length) {
    fail('METHOD_COUNT_MISMATCH', `${kind}: runtime=${api.actions.length} classModel=${model.methods.length}`)
  }
  if ((api.attributes ?? []).length !== model.attributes.length) {
    fail('ATTRIBUTE_COUNT_MISMATCH', `${kind}: runtime=${(api.attributes ?? []).length} classModel=${model.attributes.length}`)
  }
}

// 6. Forbidden legacy shapes in on-demand ClassModel projection（module metadata 的 usageRules/failureModes 合法）
const forbiddenProjectionFields = [
  'childModels',
  'returnsKind',
  'callbackTargetKind',
  'valueKind',
  'vcmCatalog',
  'callbackApis',
  'resultApis',
]
for (const kind of modelKinds) {
  const projected = JSON.stringify(projectClassModelFromApi(resolveModuleApi(classModel, kind)))
  for (const forbidden of forbiddenProjectionFields) {
    if (projected.includes(forbidden)) {
      warn('LEGACY_FIELD_IN_CLASS_MODEL', `${kind}: ${forbidden}`)
    }
  }
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

// 8. attribute.api 属性链 + 投影连通性（与 vcm_query / guide 门禁一致）
const connectivityIssues = auditClassModelReflectionConnectivity(classModel)
const attributeReachableKinds = [...listAttributeReachableKinds(classModel)].sort()
const expectedReachableKinds = [...expectedRegistry, 'project'].sort()
if (attributeReachableKinds.join(',') !== expectedReachableKinds.join(',')) {
  fail(
    'ATTRIBUTE_REACHABLE_KINDS',
    `expected ${expectedReachableKinds.join(',')}, got ${attributeReachableKinds.join(',')}`,
  )
}
for (const issue of connectivityIssues) {
  if (issue.code === 'REFLECTION_MODEL_PROJECTION_FAILED' || issue.code === 'REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES') {
    fail(issue.code, `${issue.path}: ${issue.message}`)
  }
  if (issue.code === 'REFLECTION_ATTRIBUTE_API_DISCONNECTED') {
    fail(issue.code, `${issue.path}: ${issue.message}`)
  }
}

const graph = walkAiApiMetadataGraph(resolved.rootApi)
const uniqueEdges = new Map()
for (const node of graph) {
  for (const edge of node.edges.filter(e => e.via === 'action')) {
    uniqueEdges.set(`${edge.parentKind}.${edge.viaName}->${edge.child.kind}`, edge)
  }
}
for (const kind of modelKinds) {
  const api = apisByKind.get(kind)
  const model = projectClassModelFromApi(resolveModuleApi(classModel, kind))
  if (api === undefined) continue
  for (const method of model.methods) {
    const action = api.actions.find(a => a.name === method.name)
    if (action === undefined) continue
    const hasRun = action.paramsSchema?.required?.includes('run') === true
    if (hasRun) {
      if (method.paramsTypeText === undefined || method.paramsTypeText.trim().length === 0) {
        warn('PARAMS_TYPE_TEXT_MISSING', `${kind}.${method.name} has run param but no paramsTypeText`)
      }
    } else {
      const returnRef = (action.resultApis ?? []).find(ref => (ref.resultPath ?? []).length === 0)
      const hasReturnTypeText = method.returnTypeText !== undefined && method.returnTypeText.trim().length > 0
      if (returnRef !== undefined && !hasReturnTypeText && method.returnSchema === undefined) {
        warn('RETURN_TYPE_TEXT_MISSING', `${kind}.${method.name} has resultApi return but no returnTypeText/returnSchema`)
      }
    }
    if (method.returnTypeText !== undefined || method.paramsTypeText !== undefined) {
      const sig = renderMethodSignature(classModel, kind, method)
      if (signatureContainsProblematicUnknown(sig)) {
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
  methodCount: modelKinds.reduce((n, kind) => n + projectClassModelFromApi(resolveModuleApi(classModel, kind)).methods.length, 0),
  attributeCount: modelKinds.reduce((n, kind) => n + projectClassModelFromApi(resolveModuleApi(classModel, kind)).attributes.length, 0),
  attributeReachableKinds,
  attributeConnectivityIssueCount: connectivityIssues.length,
  uniqueResultApiEdges: uniqueEdges.size,
  classModelKindCount: modelKinds.length,
  auditIssues: issues.length,
}

function signatureContainsProblematicUnknown(signature) {
  if (signature.includes('AnonSchema')) return false
  const normalized = signature
    .replaceAll('Record<string, unknown>', '')
    .replace(/value: unknown/g, '')
  return /\bunknown\b/.test(normalized)
}

console.log(JSON.stringify({ ok: issues.filter(i => i.level === 'error').length === 0, stats, issues }, null, 2))
process.exit(issues.filter(i => i.level === 'error').length === 0 ? 0 : 1)
