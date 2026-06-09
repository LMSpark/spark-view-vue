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
  compareValue(issues, 'rootKind', sourceDocument.rootKind, buildEntryDocument.rootKind)

  const sourceKinds = Object.keys(sourceDocument.models).sort()
  const buildKinds = Object.keys(buildEntryDocument.models).sort()
  compareValue(issues, 'models', sourceKinds.join(','), buildKinds.join(','))

  for (const kind of sourceKinds) {
    const sourceModel = sourceDocument.models[kind]
    const buildModel = buildEntryDocument.models[kind]
    if (sourceModel === undefined || buildModel === undefined) continue
    compareModel(issues, kind, sourceDocument, buildEntryDocument, sourceModel, buildModel)
  }
  return issues
}

function compareModel(
  issues: ClassModelBuildConsistencyIssue[],
  kind: string,
  sourceDocument: ClassModelDocument,
  buildEntryDocument: ClassModelDocument,
  sourceModel: ClassModel,
  buildModel: ClassModel,
): void {
  compareValue(issues, `${kind}.className`, sourceModel.className, buildModel.className)
  compareValue(issues, `${kind}.jsdoc`, sourceModel.jsdoc, buildModel.jsdoc)
  compareValue(
    issues,
    `${kind}.constructor.signature`,
    sourceModel.constructor === undefined
      ? undefined
      : renderConstructorSignature(sourceModel.constructor),
    buildModel.constructor === undefined
      ? undefined
      : renderConstructorSignature(buildModel.constructor),
  )
  compareValue(
    issues,
    `${kind}.constructor.jsdoc`,
    sourceModel.constructor?.jsdoc,
    buildModel.constructor?.jsdoc,
  )

  compareValue(
    issues,
    `${kind}.attributes`,
    sourceModel.attributes.map(attribute => attribute.name).sort().join(','),
    buildModel.attributes.map(attribute => attribute.name).sort().join(','),
  )
  for (const sourceAttribute of sourceModel.attributes) {
    const buildAttribute = buildModel.attributes.find(attribute => attribute.name === sourceAttribute.name)
    if (buildAttribute === undefined) continue
    compareValue(
      issues,
      `${kind}.attributes.${sourceAttribute.name}.declaration`,
      renderAttributeDeclarationLine(sourceDocument, sourceAttribute),
      renderAttributeDeclarationLine(buildEntryDocument, buildAttribute),
    )
    compareValue(
      issues,
      `${kind}.attributes.${sourceAttribute.name}.jsdoc`,
      sourceAttribute.jsdoc,
      buildAttribute.jsdoc,
    )
  }

  compareValue(
    issues,
    `${kind}.methods`,
    sourceModel.methods.map(method => method.name).sort().join(','),
    buildModel.methods.map(method => method.name).sort().join(','),
  )
  for (const sourceMethod of sourceModel.methods) {
    const buildMethod = buildModel.methods.find(method => method.name === sourceMethod.name)
    if (buildMethod === undefined) continue
    compareValue(
      issues,
      `${kind}.methods.${sourceMethod.name}.signature`,
      renderMethodSignature(sourceDocument, sourceMethod),
      renderMethodSignature(buildEntryDocument, buildMethod),
    )
    compareValue(
      issues,
      `${kind}.methods.${sourceMethod.name}.jsdoc`,
      sourceMethod.jsdoc,
      buildMethod.jsdoc,
    )
  }
}

function compareValue(
  issues: ClassModelBuildConsistencyIssue[],
  path: string,
  sourceValue: unknown,
  buildEntryValue: unknown,
): void {
  if (sourceValue === buildEntryValue) return
  issues.push({
    code: 'CLASS_MODEL_BUILD_CONSISTENCY_MISMATCH',
    path,
    message: `源码反射与构建入口不一致: source=${String(sourceValue)} buildEntry=${String(buildEntryValue)}`,
  })
}
