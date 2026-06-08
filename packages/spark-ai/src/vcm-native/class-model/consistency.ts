import type { ClassModel, ClassModelDocument } from './types'

export type ClassModelBuildConsistencyIssue = Readonly<{
  code: string
  path: string
  message: string
}>

/**
 * 跨构建对账只比较 ClassModel 稳定关键字段。
 *
 * 源码反射是语义 SSOT；构建产物入口只用于确认 d.ts 没有滞后或丢声明。
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
    compareModel(issues, kind, sourceModel, buildModel)
  }
  return issues
}

function compareModel(
  issues: ClassModelBuildConsistencyIssue[],
  kind: string,
  sourceModel: ClassModel,
  buildModel: ClassModel,
): void {
  compareValue(issues, `${kind}.className`, sourceModel.className, buildModel.className)
  compareValue(issues, `${kind}.name`, sourceModel.name, buildModel.name)
  compareValue(issues, `${kind}.jsdoc.summary`, sourceModel.jsdoc.summary, buildModel.jsdoc.summary)
  compareValue(issues, `${kind}.constructor.signature`, sourceModel.constructor?.signature, buildModel.constructor?.signature)
  compareValue(
    issues,
    `${kind}.constructor.jsdoc.summary`,
    sourceModel.constructor?.jsdoc.summary,
    buildModel.constructor?.jsdoc.summary,
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
      sourceAttribute.declaration,
      buildAttribute.declaration,
    )
    compareValue(
      issues,
      `${kind}.attributes.${sourceAttribute.name}.jsdoc.summary`,
      sourceAttribute.jsdoc.summary,
      buildAttribute.jsdoc.summary,
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
      sourceMethod.signature,
      buildMethod.signature,
    )
    compareValue(
      issues,
      `${kind}.methods.${sourceMethod.name}.jsdoc.summary`,
      sourceMethod.jsdoc.summary,
      buildMethod.jsdoc.summary,
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
