#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const WORKFLOW_ROOT = path.resolve(
  import.meta.dirname,
  '..',
  'spark-ai-server',
  'data',
  'workflow-designs',
  'lmspark',
  'homepage',
)

const REQUIRED_WORKFLOW_IDS = [
  'agent.workflow.pageDesign',
  'agent.workflow.projectPlanning',
]

const FORBIDDEN_WORKFLOW_IDS = [
  'agent.workflow.20260615130850',
  'agent.workflow.20260615130928',
]

const LEGACY_KEYS = [
  'features',
  'environment_variables',
  'conversation_variables',
  'provider',
  'toolName',
  'workflowRef',
  'toolParameters',
  'inputMapping',
  'outputMapping',
  'x_spark.classModel',
]

const errors = []

async function main() {
  const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true })
  const workflowIds = new Set(entries.filter(entry => entry.isDirectory()).map(entry => entry.name))
  for (const workflowId of REQUIRED_WORKFLOW_IDS) {
    if (!workflowIds.has(workflowId)) {
      errors.push(`Missing workflow directory: ${workflowId}`)
      continue
    }
    await verifyWorkflow(workflowId)
  }
  for (const workflowId of FORBIDDEN_WORKFLOW_IDS) {
    if (workflowIds.has(workflowId)) {
      errors.push(`Legacy workflow directory must be removed: ${workflowId}`)
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`workflow-designs: ${error}`)
    process.exit(1)
  }
}

async function verifyWorkflow(workflowId) {
  const directory = path.join(WORKFLOW_ROOT, workflowId)
  const design = await readJson(path.join(directory, 'design.json'))
  const definition = await readJson(path.join(directory, 'definition.json'))
  verifyDesign(workflowId, design)
  verifyDefinition(workflowId, definition)
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    errors.push(`Cannot read JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function verifyDesign(workflowId, design) {
  if (!isRecord(design)) return
  expectEqual(design.kind, 'agent.workflow.design', `${workflowId} design.kind`)
  expectEqual(design.id, workflowId, `${workflowId} design.id`)
  expectEqual(design.workflow?.id, workflowId, `${workflowId} design.workflow.id`)
  verifyGraph(workflowId, design.workflow?.graph, 'design')
  verifyNoRefs(workflowId, design, 'design')
  verifyNoLegacyKeys(workflowId, design, 'design')
}

function verifyDefinition(workflowId, definition) {
  if (!isRecord(definition)) return
  expectEqual(definition.kind, 'agent.workflow', `${workflowId} definition.kind`)
  expectEqual(definition.workflowId, workflowId, `${workflowId} definition.workflowId`)
  expectEqual(definition.source?.designId, workflowId, `${workflowId} definition.source.designId`)
  verifyGraph(workflowId, definition.workflow?.graph, 'definition')
  verifyNoRefs(workflowId, definition, 'definition')
  verifyNoLegacyKeys(workflowId, definition, 'definition')
}

function verifyGraph(workflowId, graph, label) {
  if (!isRecord(graph)) {
    errors.push(`${workflowId} ${label}.workflow.graph must be an object`)
    return
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  expectEqual(nodes.length, 3, `${workflowId} ${label}.nodes.length`)
  expectEqual(edges.length, 2, `${workflowId} ${label}.edges.length`)
  expectEqual(nodes[0]?.type, 'start', `${workflowId} ${label}.nodes[0].type`)
  expectEqual(nodes[1]?.type, 'node', `${workflowId} ${label}.nodes[1].type`)
  expectEqual(nodes[2]?.type, 'output', `${workflowId} ${label}.nodes[2].type`)
  verifyRuntimeBinding(workflowId, nodes[1]?.data?.runtimeBinding, label)
}

function verifyRuntimeBinding(workflowId, runtimeBinding, label) {
  if (!isRecord(runtimeBinding)) {
    errors.push(`${workflowId} ${label}.businessNode.runtimeBinding must be an object`)
    return
  }
  for (const pathSuffix of [
    'registration.alias',
    'registration.moduleId',
    'registration.businessId',
    'inputContract.identityField',
    'inputContract.messageField',
    'systemPrompt.template',
    'knowledge.rootClassName',
    'knowledge.manifestUrlRef',
    'resolveInstance.editorSource',
    'resolveInstance.identityField',
    'moduleClassRef.kind',
  ]) {
    const value = readPath(runtimeBinding, pathSuffix)
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${workflowId} ${label}.runtimeBinding.${pathSuffix} must be a non-empty string`)
    }
  }
  if (!isRecord(runtimeBinding.inputContract?.paramsSchema)) {
    errors.push(`${workflowId} ${label}.runtimeBinding.inputContract.paramsSchema must be an object`)
  }
  if (!Array.isArray(runtimeBinding.beforeFunctionCall?.gateRules)) {
    errors.push(`${workflowId} ${label}.runtimeBinding.beforeFunctionCall.gateRules must be an array`)
  }
}

function verifyNoRefs(workflowId, value, label) {
  walk(value, (currentPath, currentValue) => {
    if (currentPath.endsWith('$ref')) {
      errors.push(`${workflowId} ${label} must not contain $ref at ${currentPath}`)
    }
    if (isRecord(currentValue) && typeof currentValue.x_spark?.schemaRef === 'string') {
      errors.push(`${workflowId} ${label} must not contain x_spark.schemaRef at ${currentPath}.x_spark.schemaRef`)
    }
  })
}

function verifyNoLegacyKeys(workflowId, value, label) {
  walk(value, (currentPath) => {
    for (const key of LEGACY_KEYS) {
      if (currentPath === key || currentPath.endsWith(`.${key}`)) {
        errors.push(`${workflowId} ${label} must not contain legacy field ${currentPath}`)
      }
    }
  })
}

function walk(value, visit, currentPath = '') {
  visit(currentPath, value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${currentPath}[${index}]`))
    return
  }
  if (!isRecord(value)) return
  for (const [key, field] of Object.entries(value)) {
    walk(field, visit, currentPath.length === 0 ? key : `${currentPath}.${key}`)
  }
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function readPath(record, pathSuffix) {
  return pathSuffix.split('.').reduce((value, key) => {
    if (!isRecord(value)) return undefined
    return value[key]
  }, record)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

await main()
