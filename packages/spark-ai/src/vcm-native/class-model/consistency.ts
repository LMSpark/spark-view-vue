import type { ClassModel, ClassModelDocument } from './types'
import {
  renderAttributeDeclarationLine,
  renderConstructorSignature,
  renderMethodSignature,
} from './signature-renderer'

export type ClassModelBuildConsistencyIssue = Readonly<{
  code: string
  path: string
  message: string
}>

/**
 * 跨构建对账比较 ClassModel 稳定语义字段与投影签名。
 *
 * 源码反射是语义 SSOT；declaration/signature 在投影层即时渲染后再对账。
 */
export function compareClassModelDocumentsForBuildConsistency(
  sourceDocument: ClassModelDocument,
  buildEntryDocument: ClassModelDocument,
): readonly ClassModelBuildConsistencyIssue[] {
  const issues: ClassModelBuildConsistencyIssue[] = []
  compareValue({
    issues,
    path: 'rootKind',
    sourceValue: sourceDocument.rootKind,
    buildEntryValue: buildEntryDocument.rootKind,
  })

  const sourceKinds = Object.keys(sourceDocument.models).sort()
  const buildKinds = Object.keys(buildEntryDocument.models).sort()
  compareValue({
    issues,
    path: 'models',
    sourceValue: sourceKinds.join(','),
    buildEntryValue: buildKinds.join(','),
  })

  for (const kind of sourceKinds) {
    const sourceModel = sourceDocument.models[kind]
    const buildModel = buildEntryDocument.models[kind]
    if (sourceModel === undefined || buildModel === undefined) continue
    compareModel({
      issues,
      kind,
      sourceDocument,
      buildEntryDocument,
      sourceModel,
      buildModel,
    })
  }
  return issues
}

type CompareModelCommand = Readonly<{
  issues: ClassModelBuildConsistencyIssue[]
  kind: string
  sourceDocument: ClassModelDocument
  buildEntryDocument: ClassModelDocument
  sourceModel: ClassModel
  buildModel: ClassModel
}>

function compareModel(command: CompareModelCommand): void {
  const { issues, kind, sourceDocument, buildEntryDocument, sourceModel, buildModel } = command
  compareValue({
    issues,
    path: `${kind}.className`,
    sourceValue: sourceModel.className,
    buildEntryValue: buildModel.className,
  })
  compareValue({
    issues,
    path: `${kind}.jsdoc`,
    sourceValue: sourceModel.jsdoc,
    buildEntryValue: buildModel.jsdoc,
  })
  compareValue({
    issues,
    path: `${kind}.constructor.signature`,
    sourceValue: sourceModel.constructor === undefined
      ? undefined
      : renderConstructorSignature(sourceModel.constructor),
    buildEntryValue: buildModel.constructor === undefined
      ? undefined
      : renderConstructorSignature(buildModel.constructor),
  })
  compareValue({
    issues,
    path: `${kind}.constructor.jsdoc`,
    sourceValue: sourceModel.constructor?.jsdoc,
    buildEntryValue: buildModel.constructor?.jsdoc,
  })
  compareValue({
    issues,
    path: `${kind}.attributes`,
    sourceValue: sourceModel.attributes.map(attribute => attribute.name).sort().join(','),
    buildEntryValue: buildModel.attributes.map(attribute => attribute.name).sort().join(','),
  })
  for (const sourceAttribute of sourceModel.attributes) {
    const buildAttribute = buildModel.attributes.find(attribute => attribute.name === sourceAttribute.name)
    if (buildAttribute === undefined) continue
    compareValue({
      issues,
      path: `${kind}.attributes.${sourceAttribute.name}.declaration`,
      sourceValue: renderAttributeDeclarationLine(sourceDocument, sourceAttribute),
      buildEntryValue: renderAttributeDeclarationLine(buildEntryDocument, buildAttribute),
    })
    compareValue({
      issues,
      path: `${kind}.attributes.${sourceAttribute.name}.jsdoc`,
      sourceValue: sourceAttribute.jsdoc,
      buildEntryValue: buildAttribute.jsdoc,
    })
  }
  compareValue({
    issues,
    path: `${kind}.methods`,
    sourceValue: sourceModel.methods.map(method => method.name).sort().join(','),
    buildEntryValue: buildModel.methods.map(method => method.name).sort().join(','),
  })
  for (const sourceMethod of sourceModel.methods) {
    const buildMethod = buildModel.methods.find(method => method.name === sourceMethod.name)
    if (buildMethod === undefined) continue
    compareValue({
      issues,
      path: `${kind}.methods.${sourceMethod.name}.signature`,
      sourceValue: renderMethodSignature(sourceDocument, sourceMethod),
      buildEntryValue: renderMethodSignature(buildEntryDocument, buildMethod),
    })
    compareValue({
      issues,
      path: `${kind}.methods.${sourceMethod.name}.jsdoc`,
      sourceValue: sourceMethod.jsdoc,
      buildEntryValue: buildMethod.jsdoc,
    })
  }
}

type CompareValueCommand = Readonly<{
  issues: ClassModelBuildConsistencyIssue[]
  path: string
  sourceValue: unknown
  buildEntryValue: unknown
}>

function compareValue(command: CompareValueCommand): void {
  if (command.sourceValue === command.buildEntryValue) return
  command.issues.push({
    code: 'CLASS_MODEL_BUILD_CONSISTENCY_MISMATCH',
    path: command.path,
    message: `源码反射与构建入口不一致: source=${String(command.sourceValue)} buildEntry=${String(command.buildEntryValue)}`,
  })
}
