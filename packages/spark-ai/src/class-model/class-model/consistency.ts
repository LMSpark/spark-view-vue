import type { ClassModel, ClassModelDocument } from './types'
import {
  collectModuleApiKinds,
  projectClassModelFromApi,
  resolveModuleApiOrUndefined,
} from './model-projection'
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

/** 跨构建对账：按需投影 ClassModel 后比较稳定语义字段。 */
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

  const kinds = [...new Set([
    ...collectModuleApiKinds(sourceDocument.module),
    ...collectModuleApiKinds(buildEntryDocument.module),
  ])].sort()
  compareValue({
    issues,
    path: 'module.kinds',
    sourceValue: collectModuleApiKinds(sourceDocument.module).join(','),
    buildEntryValue: collectModuleApiKinds(buildEntryDocument.module).join(','),
  })

  for (const kind of kinds) {
    const sourceApi = resolveModuleApiOrUndefined(sourceDocument, kind)
    const buildApi = resolveModuleApiOrUndefined(buildEntryDocument, kind)
    if (sourceApi === undefined || buildApi === undefined) {
      compareValue({
        issues,
        path: `${kind}.modulePresence`,
        sourceValue: sourceApi === undefined ? 'missing' : 'present',
        buildEntryValue: buildApi === undefined ? 'missing' : 'present',
      })
      continue
    }
    const sourceModel = projectClassModelFromApi(sourceApi)
    const buildModel = projectClassModelFromApi(buildApi)
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
    path: `${kind}.constructorMeta.signature`,
    sourceValue: sourceModel.constructorMeta === undefined
      ? undefined
      : renderConstructorSignature(sourceModel.constructorMeta),
    buildEntryValue: buildModel.constructorMeta === undefined
      ? undefined
      : renderConstructorSignature(buildModel.constructorMeta),
  })
  compareValue({
    issues,
    path: `${kind}.constructorMeta.jsdoc`,
    sourceValue: sourceModel.constructorMeta?.jsdoc,
    buildEntryValue: buildModel.constructorMeta?.jsdoc,
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
      sourceValue: renderAttributeDeclarationLine(sourceDocument, kind, sourceAttribute),
      buildEntryValue: renderAttributeDeclarationLine(buildEntryDocument, kind, buildAttribute),
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
      sourceValue: renderMethodSignature(sourceDocument, kind, sourceMethod),
      buildEntryValue: renderMethodSignature(buildEntryDocument, kind, buildMethod),
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
