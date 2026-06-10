import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
import {
  listManifestAttributeReachableKinds,
  listManifestKindIds,
  readVcmBundleManifest,
} from '../packages/spark-ai/src/vcm-native/metadata/vcm-bundle-assembler.ts'
import {
  compareVcmBundleWithMonolithicRuntime,
  loadVcmBundlePartsFromDist,
} from '../packages/spark-ai/src/vcm-native/metadata/vcm-bundle-parity.ts'
import { readVcmMetadataConfig } from '../packages/vite-plugin-spark-catalog/src/vcm-config.ts'

const root = resolve(import.meta.dirname, '..')
const config = readVcmMetadataConfig(root)

const legacyVcmOutputDirs = [
  'generated/vcm/project-model',
  'generated/vcm/project-page-surface',
]

const allIssues = []
const targetStats = []

for (const target of config.metadataTargets) {
  const distDir = resolve(root, target.outputs.distDir?.trim() || dirname(target.outputs.runtime))
  const runtimePath = resolve(root, target.outputs.runtime)
  const jsdocTodoPath = resolve(root, target.outputs.jsdocTodoLog)
  const compileReportPath = resolve(distDir, 'vcm-compile-report.json')
  const manifestPath = resolve(distDir, 'manifest.json')

  const issues = []
  const fail = (code, message) => issues.push({ level: 'error', code, message, targetId: target.id })
  const warn = (code, message) => issues.push({ level: 'warning', code, message, targetId: target.id })

  if (!existsSync(runtimePath)) {
    fail('RUNTIME_MISSING', runtimePath)
    allIssues.push(...issues)
    continue
  }

  const raw = JSON.parse(readFileSync(runtimePath, 'utf8'))
  const runtime = readModuleMetadataRuntimeDocument(raw)
  const classModel = createClassModelDocumentFromRuntimeDocument(raw)
  const resolved = resolveModuleMetadataJson(runtime.modules[0], { schemaDefs: raw.$defs })

  let manifest
  if (existsSync(manifestPath)) {
    manifest = readVcmBundleManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
    for (const entry of Object.values(manifest.kinds)) {
      const kindPath = resolve(distDir, entry.file)
      if (!existsSync(kindPath)) {
        fail('KIND_FILE_MISSING', `${target.id}: ${entry.file}`)
      }
    }
    if (manifest.targetId !== target.id) {
      fail('MANIFEST_TARGET_ID', `expected ${target.id}, got ${manifest.targetId}`)
    }
  } else {
    fail('MANIFEST_MISSING', manifestPath)
  }

  const expectedRootKind = manifest?.rootKind ?? target.roots[0]?.kind ?? 'project'
  const expectedRegistryKinds = manifest === undefined
    ? []
    : listManifestKindIds(manifest).filter(kind => kind !== manifest.rootKind).sort()
  const expectedReachableKinds = manifest === undefined
    ? []
    : [...listManifestAttributeReachableKinds(manifest)].sort()

  if (runtime.schemaVersion !== 2) fail('RUNTIME_SCHEMA_VERSION', `expected 2, got ${runtime.schemaVersion}`)
  if (runtime.modules.length !== 1) fail('RUNTIME_MODULE_COUNT', `expected 1 module, got ${runtime.modules.length}`)

  const module = runtime.modules[0]
  const registryKinds = Object.keys(module.apiRegistry ?? {}).sort()
  if (registryKinds.join(',') !== expectedRegistryKinds.join(',')) {
    fail('API_REGISTRY_KINDS', `registry mismatch: ${registryKinds.join(',')} expected ${expectedRegistryKinds.join(',')}`)
  }
  if (module.rootApi.kind !== expectedRootKind) {
    fail('ROOT_KIND', `expected ${expectedRootKind}, got ${module.rootApi.kind}`)
  }

  const missingDefs = findMissingJsonSchemaDefRefs(raw)
  if (missingDefs.length > 0) fail('MISSING_DEFS', `missing $defs: ${missingDefs.join(', ')}`)

  try {
    validateApiObjectMetadata(resolved.rootApi)
  } catch (error) {
    fail('VALIDATE_ROOT_API', String(error))
  }

  const modelKinds = collectModuleApiKinds(classModel.module).sort()
  const expectedModelKinds = [...expectedRegistryKinds, expectedRootKind].sort()
  if (modelKinds.join(',') !== expectedModelKinds.join(',')) {
    fail('CLASS_MODEL_KINDS', `${modelKinds.join(',')} expected ${expectedModelKinds.join(',')}`)
  }

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

  const connectivityIssues = auditClassModelReflectionConnectivity(classModel)
  const attributeReachableKinds = [...listAttributeReachableKinds(classModel)].sort()
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

  const selfIssues = compareClassModelDocumentsForBuildConsistency(classModel, classModel)
  if (selfIssues.length > 0) fail('CLASS_MODEL_SELF_CONSISTENCY', JSON.stringify(selfIssues))

  if (manifest !== undefined && existsSync(manifestPath)) {
    try {
      const bundleParts = loadVcmBundlePartsFromDist(distDir, absolutePath => JSON.parse(readFileSync(absolutePath, 'utf8')))
      const bundleParityIssues = compareVcmBundleWithMonolithicRuntime({
        bundle: bundleParts,
        monolithic: raw,
      })
      for (const issue of bundleParityIssues) {
        fail(issue.code, `${target.id}: ${issue.path} ${issue.message}`)
      }
    } catch (error) {
      fail('BUNDLE_MONOLITHIC_PARITY', `${target.id}: ${String(error)}`)
    }
  }

  if (!existsSync(compileReportPath)) fail('COMPILE_REPORT_MISSING', compileReportPath)
  let compileReport = null
  if (existsSync(compileReportPath)) {
    compileReport = JSON.parse(readFileSync(compileReportPath, 'utf8'))
    if (compileReport.protocol !== 'spark-appworks.vcm.compile-report') {
      fail('COMPILE_REPORT_PROTOCOL', compileReport.protocol ?? '(missing)')
    }
    if (compileReport.gates?.diagnosticErrorCount > 0) {
      fail('COMPILE_REPORT_DIAGNOSTIC_ERRORS', String(compileReport.gates.diagnosticErrorCount))
    }
    if (compileReport.gates?.lifecycleErrorCount > 0) {
      fail('COMPILE_REPORT_LIFECYCLE_ERRORS', String(compileReport.gates.lifecycleErrorCount))
    }
    if (compileReport.gates?.jsdocSourceTodoCount > 0) {
      fail('JSDOC_SOURCE_TODOS', `pending=${String(compileReport.gates.jsdocSourceTodoCount)} see ${jsdocTodoPath}`)
    }
    if (compileReport.gates?.schemaSourceTodoCount > 0) {
      fail('SCHEMA_SOURCE_TODOS', `pending=${String(compileReport.gates.schemaSourceTodoCount)}`)
    }
  }

  targetStats.push({
    targetId: target.id,
    defsCount: Object.keys(raw.$defs ?? {}).length,
    methodCount: modelKinds.reduce((n, kind) => n + projectClassModelFromApi(resolveModuleApi(classModel, kind)).methods.length, 0),
    attributeCount: modelKinds.reduce((n, kind) => n + projectClassModelFromApi(resolveModuleApi(classModel, kind)).attributes.length, 0),
    attributeReachableKinds,
    attributeConnectivityIssueCount: connectivityIssues.length,
    uniqueResultApiEdges: uniqueEdges.size,
    classModelKindCount: modelKinds.length,
    auditIssues: issues.length,
    compileReportGates: compileReport?.gates ?? null,
    bundleKindCount: compileReport?.bundle?.kindFiles?.length ?? 0,
  })

  allIssues.push(...issues)
}

function signatureContainsProblematicUnknown(signature) {
  if (signature.includes('AnonSchema')) return false
  const normalized = signature
    .replaceAll('Record<string, unknown>', '')
    .replace(/value: unknown/g, '')
  return /\bunknown\b/.test(normalized)
}

for (const legacyDir of legacyVcmOutputDirs) {
  const absolute = resolve(root, legacyDir)
  if (existsSync(absolute)) {
    allIssues.push({
      level: 'error',
      code: 'LEGACY_VCM_OUTPUT_PATH',
      message: `Remove legacy VCM output dir (use generated/vcm/dist/<target-id>/): ${legacyDir}`,
      targetId: '(registry)',
    })
  }
}

const errorCount = allIssues.filter(issue => issue.level === 'error').length
const primaryStats = targetStats.find(stat => stat.targetId === 'project-page-surface') ?? targetStats[0] ?? null

console.log(JSON.stringify({
  ok: errorCount === 0,
  targets: targetStats,
  stats: primaryStats,
  issues: allIssues,
}, null, 2))
process.exit(errorCount === 0 ? 0 : 1)
