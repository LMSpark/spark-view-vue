import { readFileSync } from 'node:fs'
import { createClassModelDocumentFromRuntimeDocument } from '../packages/spark-ai/src/vcm-native/index.ts'
import {
  renderAttributeDeclarationLine,
  renderConstructorSignature,
  renderMethodSignature,
} from '../packages/spark-ai/src/vcm-native/class-model/signature-renderer.ts'

const raw = JSON.parse(readFileSync('generated/vcm/dist/project-page-surface/project-page-surface-module-metadata.runtime.generated.json', 'utf8'))
const cm = createClassModelDocumentFromRuntimeDocument(raw)

function kb(bytes) {
  return Math.round(bytes / 1024 * 10) / 10
}

function buildOldShapeEstimate(document) {
  const models = {}
  for (const [kind, model] of Object.entries(document.models)) {
    models[kind] = {
      ...model,
      name: model.className,
      declaration: `class ${model.className}`,
      constructor: model.constructor === undefined
        ? undefined
        : {
            ...model.constructor,
            signature: renderConstructorSignature(model.constructor),
            declaration: renderConstructorSignature(model.constructor),
          },
      attributes: model.attributes.map(attribute => ({
        ...attribute,
        typeText: renderAttributeDeclarationLine(document, attribute).split(': ').slice(1).join(': '),
        declaration: renderAttributeDeclarationLine(document, attribute),
      })),
      methods: model.methods.map(method => {
        const module = raw.modules[0]
        const api = module.rootApi.kind === kind
          ? module.rootApi
          : module.apiRegistry?.[kind]
        const action = api?.actions.find(candidate => candidate.name === method.name)
        return {
          ...method,
          methodName: method.name,
          signature: renderMethodSignature(document, method),
          declaration: renderMethodSignature(document, method),
          returnTypeText: renderMethodSignature(document, method).split(': ').slice(-1)[0] ?? 'void',
          usageRules: action?.usageRules ?? [],
          requiredBeforeCall: action?.requiredBeforeCall ?? [],
          failureModes: action?.failureModes ?? [],
        }
      }),
    }
  }
  return { ...document, models }
}

const runtimeBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8')
const cmBytes = Buffer.byteLength(JSON.stringify(cm), 'utf8')
const oldCm = buildOldShapeEstimate(cm)
const oldCmBytes = Buffer.byteLength(JSON.stringify(oldCm), 'utf8')

const runtimeFieldCounts = countFields(raw)
const cmFieldCounts = countFields(cm)
const oldCmFieldCounts = countFields(oldCm)

console.log(JSON.stringify({
  persisted: {
    runtimeKB: kb(runtimeBytes),
    note: 'ClassModel 不落盘；runtime 是唯一持久化知识 JSON',
  },
  projectedInMemory: {
    classModelKB: kb(cmBytes),
    oldClassModelKB: kb(oldCmBytes),
    savedKB: kb(oldCmBytes - cmBytes),
    savedPercent: `${Math.round((1 - cmBytes / oldCmBytes) * 1000) / 10}%`,
    prettyLineCount: JSON.stringify(cm, null, 2).split('\n').length,
    oldPrettyLineCountEstimate: Math.round(JSON.stringify(cm, null, 2).split('\n').length * (oldCmBytes / cmBytes)),
  },
  whereWeightLives: {
    runtime: runtimeFieldCounts,
    classModel: cmFieldCounts,
    duplicatedInOldClassModel: {
      extraFields: oldCmFieldCounts.total - cmFieldCounts.total,
      usageRuleArrays: countArrayItems(oldCm, 'usageRules'),
      failureModeArrays: countArrayItems(oldCm, 'failureModes'),
    },
  },
  interpretation: [
    '体积收益主要在 Worker/主线程内存中的 ClassModel 对象，不在 git 产物。',
    'runtime 仍保留 description+jsdoc+usageRules 等，故总知识体积几乎不变。',
    '简化价值在语义单真源与投影一致性，不在缩小 runtime.generated.json。',
  ],
}, null, 2))

function countFields(value, counts = { total: 0, keys: 0, strings: 0, schema: 0 }) {
  if (value === null || typeof value !== 'object') return counts
  if (Array.isArray(value)) {
    for (const item of value) countFields(item, counts)
    return counts
  }
  for (const [key, child] of Object.entries(value)) {
    counts.keys += 1
    counts.total += 1
    if (key === 'paramsSchema' || key === 'returnSchema' || key === 'schema' || key === '$defs') {
      countFields(child, counts)
      counts.schema += 1
      continue
    }
    if (typeof child === 'string') {
      counts.strings += child.length
      continue
    }
    countFields(child, counts)
  }
  return counts
}

function countArrayItems(document, fieldName) {
  let n = 0
  for (const model of Object.values(document.models)) {
    for (const method of model.methods) {
      const items = method[fieldName]
      if (Array.isArray(items)) n += items.length
    }
  }
  return n
}
