/**
 * @module @spark-appworks/spark-ai:class-model/class-model/project-from-declarations
 * @spark-appworks/spark-ai 的 class-model/class-model/project-from-declarations 模块。
 * 导出 ClassModel symbol: ProjectDtsSourceFileProjectionOptions（共 1 个 symbol）。
 */
import { relative, resolve } from 'node:path'

import ts from 'typescript'

import {
  DTS_CLASS_MODEL_SURFACE_VERSION,
  type DtsClassModelSurfaceDocument,
  type ProjectDtsClassModelSurfaceOptions,
} from './dts-surface-types'
import {
  DTS_FILE_PROJECTION_VERSION,
  type DtsFileModuleSemanticMeta,
  type DtsFileProjectionDocument,
  type ProjectDtsFileProjectionOptions,
} from './dts-bundle-types'
import {
  paramsSchemaFromSignature,
  signatureParamsTypeText,
  typeToAiJsonSchema,
} from './dts-type-schema'
import type {
  AttributeMeta,
  ClassModel,
  ClassModelDeclarationRelation,
  ClassModelDeclarationRelationKind,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  ConstructorMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'

type ProjectionContext = Readonly<{
  checker: ts.TypeChecker
  repoRoot: string
  exportedOnly: boolean
  failOnDuplicate: boolean
  models: Record<string, ClassModel>
  fileIndex: Record<string, string[]>
}>

type ProjectionSite = Readonly<{
  context: ProjectionContext
  sourceFile: ts.SourceFile
  className: string
}>

/** Project Dts Source File Projection Options 的调用配置。 */
type ProjectDtsSourceFileProjectionOptions = Readonly<{
  repoRoot: string
  absolutePath: string
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
  exportedOnly?: boolean
}>

type ComponentProvenanceMeta = Pick<
  SourceProvenanceMeta,
  'componentName' | 'componentType' | 'componentLevel' | 'componentLayer' | 'componentDirectory'
>

type ComponentDirectoryClassification = Readonly<{
  directory: string
  level: ComponentClassModelLevel
  layer: ComponentClassModelLayer
}>

type DtsFileModuleSemanticCommand = Readonly<{
  repoRoot: string
  sourceFile: ts.SourceFile
  sourcePath: string
  symbols: readonly string[]
}>

type ClassLikeProjectionCommand = Readonly<{
  site: ProjectionSite
  node: ts.ClassDeclaration | ts.InterfaceDeclaration
  shapeKind: 'class' | 'interface'
}>

type ObjectSchemaAttributesCommand = Readonly<{
  site: ProjectionSite
  schema: ReturnType<typeof typeToAiJsonSchema>
  typeNode: ts.TypeNode
}>

type TypeLiteralAttributesCommand = Readonly<{
  site: ProjectionSite
  typeNode: ts.TypeLiteralNode
}>

type TypeNodeAttributesCommand = Readonly<{
  site: ProjectionSite
  typeNode: ts.TypeNode
}>

type PropertyMemberCommand = Readonly<{
  site: ProjectionSite
  memberName: string
  member: ts.PropertyDeclaration
}>

type PropertySignatureCommand = Readonly<{
  site: ProjectionSite
  memberName: string
  member: ts.PropertySignature
}>

type MethodMemberCommand = Readonly<{
  site: ProjectionSite
  memberName: string
  member: ts.MethodDeclaration
}>

type MethodSignatureCommand = Readonly<{
  site: ProjectionSite
  memberName: string
  member: ts.MethodSignature
}>

type ConstructorProjectionCommand = Readonly<{
  site: ProjectionSite
  member: ts.ConstructorDeclaration
}>

type CreateDeclarationRelationCommand = Readonly<{
  kind: ClassModelDeclarationRelationKind
  typeText: string
  targetName?: string
}>

/** 单个 `.d.ts` → 单个 JSON 投影。 */
export function projectDtsFileProjection(
  options: ProjectDtsFileProjectionOptions,
): DtsFileProjectionDocument {
  const repoRoot = resolve(options.repoRoot)
  const absolutePath = resolve(options.absolutePath)
  const program = ts.createProgram({
    rootNames: [absolutePath],
    options: {
      allowJs: false,
      declaration: true,
      emitDeclarationOnly: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  })
  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(absolutePath)
  if (sourceFile === undefined) {
    throw new Error(`DTS source file not found in TypeScript program: ${absolutePath}`)
  }

  return projectDtsSourceFileProjection({
    repoRoot,
    absolutePath,
    sourceFile,
    checker,
    ...(options.exportedOnly === undefined ? {} : { exportedOnly: options.exportedOnly }),
  })
}

/** 单个 `.d.ts` → 单个 JSON 投影，复用外部 TypeScript Program 的 checker。 */
export function projectDtsSourceFileProjection(
  options: ProjectDtsSourceFileProjectionOptions,
): DtsFileProjectionDocument {
  const repoRoot = resolve(options.repoRoot)
  const absolutePath = resolve(options.absolutePath)
  const context: ProjectionContext = {
    checker: options.checker,
    repoRoot,
    exportedOnly: options.exportedOnly ?? false,
    failOnDuplicate: false,
    models: {},
    fileIndex: {},
  }
  const symbols: string[] = []
  ts.forEachChild(options.sourceFile, node => {
    const className = projectTopLevelDeclaration(context, options.sourceFile, node)
    if (className !== undefined) symbols.push(className)
  })
  const sourcePath = normalizeRepoPath(absolutePath, repoRoot)

  return {
    schemaVersion: DTS_FILE_PROJECTION_VERSION,
    sourcePath,
    module: createDtsFileModuleSemanticMeta({
      repoRoot,
      sourceFile: options.sourceFile,
      sourcePath,
      symbols,
    }),
    symbols,
    models: context.models,
    generatedAt: new Date().toISOString(),
  }
}

/** 从 declarations/ tsconfig 投影全仓 `.d.ts` → ClassModel 索引。 */
export function projectDtsClassModelSurface(
  options: ProjectDtsClassModelSurfaceOptions,
): DtsClassModelSurfaceDocument {
  const configPath = resolve(options.configPath)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error !== undefined) {
    throw new Error(ts.formatDiagnostic(configFile.error, formatHost))
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    resolve(configPath, '..'),
    undefined,
    configPath,
  )
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(error => ts.formatDiagnostic(error, formatHost)).join('\n'))
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
  })
  const checker = program.getTypeChecker()
  const repoRoot = resolve(configPath, '../..')
  const skipVueComponentDts = options.skipVueComponentDts ?? true
  const exportedOnly = options.exportedOnly ?? true
  const failOnDuplicate = options.failOnDuplicate ?? true

  const context: ProjectionContext = {
    checker,
    repoRoot,
    exportedOnly,
    failOnDuplicate,
    models: {},
    fileIndex: {},
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile === false) continue
    const normalized = normalizeRepoPath(sourceFile.fileName, repoRoot)
    if (skipVueComponentDts && normalized.endsWith('.vue.d.ts')) continue
    if (!normalized.startsWith('declarations/')) continue

    const contributed: string[] = []
    ts.forEachChild(sourceFile, node => {
      const className = projectTopLevelDeclaration(context, sourceFile, node)
      if (className !== undefined) {
        contributed.push(className)
      }
    })

    if (contributed.length > 0) {
      fileIndexMerge(context.fileIndex, normalized, contributed)
    }
  }

  return {
    schemaVersion: DTS_CLASS_MODEL_SURFACE_VERSION,
    source: 'declarations',
    configPath,
    models: context.models,
    fileIndex: context.fileIndex,
    generatedAt: new Date().toISOString(),
  }
}

export function resolveDtsClassModel(
  surface: DtsClassModelSurfaceDocument,
  className: string,
): ClassModel | undefined {
  return surface.models[className]
}

function projectTopLevelDeclaration(
  context: ProjectionContext,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  if (ts.isClassDeclaration(node)) {
    const name = readDeclarationName(node)
    if (name === undefined) return undefined
    if (isSyntheticDeclarationName(name)) return undefined
    return projectClassLike({
      site: projectionSite(context, sourceFile, name),
      node,
      shapeKind: 'class',
    })
  }
  if (ts.isInterfaceDeclaration(node)) {
    const name = readDeclarationName(node)
    if (name === undefined) return undefined
    if (isSyntheticDeclarationName(name)) return undefined
    return projectClassLike({
      site: projectionSite(context, sourceFile, name),
      node,
      shapeKind: 'interface',
    })
  }
  if (ts.isTypeAliasDeclaration(node)) {
    if (isSyntheticDeclarationName(node.name.text)) return undefined
    return projectTypeAlias(context, sourceFile, node)
  }
  if (ts.isEnumDeclaration(node)) {
    if (isSyntheticDeclarationName(node.name.text)) return undefined
    return projectEnum(context, sourceFile, node)
  }
  return undefined
}

function readDeclarationName(node: ts.ClassDeclaration | ts.InterfaceDeclaration): string | undefined {
  return node.name?.text
}

function isSyntheticDeclarationName(name: string): boolean {
  return name.startsWith('__VLS_')
}

function projectionSite(
  context: ProjectionContext,
  sourceFile: ts.SourceFile,
  className: string,
): ProjectionSite {
  return { context, sourceFile, className }
}

function projectClassLike(command: ClassLikeProjectionCommand): string | undefined {
  const { site, node, shapeKind } = command
  const { context, sourceFile } = site
  const name = readDeclarationName(node)
  if (name === undefined) return undefined
  const className = name
  const siteWithName = projectionSite(context, sourceFile, className)
  if (context.exportedOnly && !hasExportModifier(node)) return undefined
  const file = normalizeRepoPath(sourceFile.fileName, context.repoRoot)
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const propsComponentName = readComponentNameFromPropsFile(file)
  const provenance = createProvenance({
    file,
    line,
    className,
    declarationKind: shapeKind,
    ...(propsComponentName === undefined ? {} : { componentName: propsComponentName }),
  })
  const declarationRelations = classLikeDeclarationRelations(node, sourceFile)

  const attributes: AttributeMeta[] = []
  const methods: MethodMeta[] = []
  let constructorMeta: ConstructorMeta | undefined

  if (ts.isClassDeclaration(node)) {
    for (const member of node.members) {
      if (isPrivateMember(member)) continue
      if (ts.isPropertyDeclaration(member)) {
        const memberName = readMemberName(member.name)
        if (memberName === undefined) continue
        attributes.push(projectPropertyMember({
          site: siteWithName,
          memberName,
          member,
        }))
        continue
      }
      if (ts.isMethodDeclaration(member)) {
        const memberName = readMemberName(member.name)
        if (memberName === undefined) continue
        methods.push(projectMethodMember({
          site: siteWithName,
          memberName,
          member,
        }))
        continue
      }
      if (ts.isConstructorDeclaration(member)) {
        constructorMeta = projectConstructor({ site: siteWithName, member })
      }
    }
  } else {
    for (const member of node.members) {
      if (ts.isPropertySignature(member)) {
        const memberName = readMemberName(member.name)
        if (memberName === undefined) continue
        attributes.push(projectPropertySignature({
          site: siteWithName,
          memberName,
          member,
        }))
        continue
      }
      if (ts.isMethodSignature(member)) {
        const memberName = readMemberName(member.name)
        if (memberName === undefined) continue
        methods.push(projectMethodSignature({
          site: siteWithName,
          memberName,
          member,
        }))
      }
    }
  }

  registerModel(context, className, {
    kind: className,
    className,
    jsdoc: readJsDoc(context.checker, node),
    shapeKind,
    ...(declarationRelations.length === 0 ? {} : { declarationRelations }),
    provenance,
    ...(constructorMeta === undefined ? {} : { constructorMeta }),
    attributes,
    methods,
  })
  return className
}

function projectTypeAlias(
  context: ProjectionContext,
  sourceFile: ts.SourceFile,
  node: ts.TypeAliasDeclaration,
): string | undefined {
  const name = node.name.text
  if (context.exportedOnly && !hasExportModifier(node)) return undefined

  const file = normalizeRepoPath(sourceFile.fileName, context.repoRoot)
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const propsComponentName = readComponentNameFromPropsFile(file)
  const type = context.checker.getTypeAtLocation(node)
  const typeText = node.type.getText(sourceFile)
  const declarationRelations = typeAliasDeclarationRelations(node.type, sourceFile)
  const objectSchema = typeToAiJsonSchema(context.checker, type, node.type)
  const attributes = attributesFromObjectSchema({
    site: projectionSite(context, sourceFile, name),
    schema: objectSchema,
    typeNode: node.type,
  })

  registerModel(context, name, {
    kind: name,
    className: name,
    jsdoc: readJsDoc(context.checker, node),
    shapeKind: 'type',
    declarationTypeText: typeText,
    ...(declarationRelations.length === 0 ? {} : { declarationRelations }),
    provenance: createProvenance({
      file,
      line,
      className: name,
      declarationKind: 'type',
      ...(propsComponentName === undefined ? {} : { componentName: propsComponentName }),
    }),
    attributes,
    methods: [],
  })
  return name
}

function projectEnum(
  context: ProjectionContext,
  sourceFile: ts.SourceFile,
  node: ts.EnumDeclaration,
): string | undefined {
  const name = node.name.text
  if (context.exportedOnly && !hasExportModifier(node)) return undefined

  const file = normalizeRepoPath(sourceFile.fileName, context.repoRoot)
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const attributes: AttributeMeta[] = []

  for (const member of node.members) {
    if (!ts.isEnumMember(member)) continue
    const memberName = readMemberName(member.name)
    if (memberName === undefined) continue
    const memberLine = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
    attributes.push({
      name: memberName,
      schema: member.initializer === undefined
        ? { type: 'string' }
        : typeToAiJsonSchema(context.checker, context.checker.getTypeAtLocation(member.initializer)),
      readable: true,
      writable: false,
      jsdoc: readJsDoc(context.checker, member),
      provenance: createProvenance({
        file,
        line: memberLine,
        className: name,
        memberName,
        declarationKind: 'enum',
      }),
    })
  }

  registerModel(context, name, {
    kind: name,
    className: name,
    jsdoc: readJsDoc(context.checker, node),
    shapeKind: 'enum',
    provenance: createProvenance({
      file,
      line,
      className: name,
      declarationKind: 'enum',
    }),
    attributes,
    methods: [],
  })
  return name
}

function classLikeDeclarationRelations(
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
): readonly ClassModelDeclarationRelation[] {
  const relations: ClassModelDeclarationRelation[] = []
  for (const clause of node.heritageClauses ?? []) {
    const relationKind = heritageClauseRelationKind(clause)
    for (const type of clause.types) {
      relations.push(createDeclarationRelation({
        kind: relationKind,
        typeText: type.getText(sourceFile),
        targetName: type.expression.getText(sourceFile),
      }))
    }
  }
  return relations
}

function heritageClauseRelationKind(clause: ts.HeritageClause): ClassModelDeclarationRelationKind {
  return clause.token === ts.SyntaxKind.ImplementsKeyword ? 'implements' : 'extends'
}

function typeAliasDeclarationRelations(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
): readonly ClassModelDeclarationRelation[] {
  if (ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.map(child => createTypeNodeDeclarationRelation('intersection', child, sourceFile))
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.map(child => createTypeNodeDeclarationRelation('union', child, sourceFile))
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    return [createTypeNodeDeclarationRelation('alias', typeNode, sourceFile)]
  }
  return []
}

function createTypeNodeDeclarationRelation(
  kind: ClassModelDeclarationRelationKind,
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
): ClassModelDeclarationRelation {
  const targetName = readTypeNodeTargetName(typeNode, sourceFile)
  return createDeclarationRelation({
    kind,
    typeText: typeNode.getText(sourceFile),
    ...(targetName === undefined ? {} : { targetName }),
  })
}

function createDeclarationRelation(input: CreateDeclarationRelationCommand): ClassModelDeclarationRelation {
  return input.targetName === undefined || input.targetName.length === 0
    ? { kind: input.kind, typeText: input.typeText }
    : input
}

function readTypeNodeTargetName(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isTypeReferenceNode(typeNode)) return typeNode.typeName.getText(sourceFile)
  if (ts.isExpressionWithTypeArguments(typeNode)) return typeNode.expression.getText(sourceFile)
  return undefined
}

/**
 * 原始 `.d.ts` 链路只记录直接声明边；attributes/methods 是 TypeChecker 派生缓存。
 * 如果派生缓存缺属性或缺 JSDoc，先看 declarationRelations 找到链路下一跳，再到 semantic-gaps 看断在哪个源声明。
 */
function attributesFromObjectSchema(command: ObjectSchemaAttributesCommand): AttributeMeta[] {
  const { site, schema, typeNode } = command
  const { context, sourceFile, className } = site
  const syntaxAttributes = typeNodeAttributes({ site, typeNode })
  if (syntaxAttributes.length > 0) return syntaxAttributes

  if (schema === true || schema === false || typeof schema !== 'object' || Array.isArray(schema)) {
    return []
  }
  if (schema.properties === undefined) {
    return []
  }

  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  )
  const file = normalizeRepoPath(sourceFile.fileName, context.repoRoot)
  return Object.entries(schema.properties).map(([propertyName, propertySchema]) => ({
    name: propertyName,
    schema: propertySchema,
    readable: true,
    writable: required.has(propertyName),
    jsdoc: '',
    provenance: createProvenance({
      file,
      line: sourceFile.getLineAndCharacterOfPosition(typeNode.getStart()).line + 1,
      className,
      memberName: propertyName,
      declarationKind: 'type',
    }),
  }))
}

function typeNodeAttributes(command: TypeNodeAttributesCommand): AttributeMeta[] {
  const { site, typeNode } = command
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeLiteralAttributes({ site, typeNode })
  }
  if (ts.isIntersectionTypeNode(typeNode)) {
    const attributes: AttributeMeta[] = []
    const seen = new Set<string>()
    for (const child of typeNode.types) {
      for (const attribute of typeNodeAttributes({ site, typeNode: child })) {
        if (seen.has(attribute.name)) continue
        seen.add(attribute.name)
        attributes.push(attribute)
      }
    }
    return attributes
  }
  return []
}

function typeLiteralAttributes(command: TypeLiteralAttributesCommand): AttributeMeta[] {
  const { site, typeNode } = command
  const attributes: AttributeMeta[] = []
  for (const member of typeNode.members) {
    if (!ts.isPropertySignature(member)) continue
    const memberName = readMemberName(member.name)
    if (memberName === undefined) continue
    attributes.push(projectPropertySignature({
      site,
      memberName,
      member,
    }))
  }
  return attributes
}

function projectPropertyMember(command: PropertyMemberCommand): AttributeMeta {
  const { site, memberName, member } = command
  const { context, sourceFile, className } = site
  const line = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
  const type = context.checker.getTypeAtLocation(member)
  return {
    name: memberName,
    schema: typeToAiJsonSchema(context.checker, type, member.type),
    readable: true,
    writable: !hasReadonlyModifier(member),
    jsdoc: readJsDoc(context.checker, member),
    provenance: createProvenance({
      file: normalizeRepoPath(sourceFile.fileName, context.repoRoot),
      line,
      className,
      memberName,
      declarationKind: 'class',
    }),
  }
}

function projectPropertySignature(command: PropertySignatureCommand): AttributeMeta {
  const { site, memberName, member } = command
  const { context, sourceFile, className } = site
  const line = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
  const type = context.checker.getTypeAtLocation(member)
  return {
    name: memberName,
    schema: typeToAiJsonSchema(context.checker, type, member.type),
    readable: true,
    writable: member.questionToken === undefined && !hasReadonlyModifier(member),
    jsdoc: readJsDoc(context.checker, member),
    provenance: createProvenance({
      file: normalizeRepoPath(sourceFile.fileName, context.repoRoot),
      line,
      className,
      memberName,
      declarationKind: 'interface',
    }),
  }
}

function projectMethodMember(command: MethodMemberCommand): MethodMeta {
  const { site, memberName, member } = command
  const { context, sourceFile, className } = site
  const line = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
  const signature = context.checker.getSignatureFromDeclaration(member)
  if (signature === undefined) {
    throw new Error(`Missing method signature for ${className}.${memberName}`)
  }
  const returnType = context.checker.getReturnTypeOfSignature(signature)
  return {
    name: memberName,
    paramsSchema: paramsSchemaFromSignature(context.checker, signature),
    returnSchema: typeToAiJsonSchema(context.checker, returnType, member.type),
    returnTypeText: member.type === undefined
      ? context.checker.typeToString(returnType, undefined, ts.TypeFormatFlags.NoTruncation)
      : member.type.getText(sourceFile),
    jsdoc: readJsDoc(context.checker, member),
    paramsTypeText: signatureParamsTypeText(context.checker, signature),
    provenance: createProvenance({
      file: normalizeRepoPath(sourceFile.fileName, context.repoRoot),
      line,
      className,
      memberName,
      declarationKind: 'class',
    }),
  }
}

function projectMethodSignature(command: MethodSignatureCommand): MethodMeta {
  const { site, memberName, member } = command
  const { context, sourceFile, className } = site
  const line = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
  const signature = context.checker.getSignatureFromDeclaration(member)
  if (signature === undefined) {
    throw new Error(`Missing method signature for ${className}.${memberName}`)
  }
  const returnType = context.checker.getReturnTypeOfSignature(signature)
  return {
    name: memberName,
    paramsSchema: paramsSchemaFromSignature(context.checker, signature),
    returnSchema: typeToAiJsonSchema(context.checker, returnType, member.type),
    returnTypeText: member.type === undefined
      ? context.checker.typeToString(returnType, undefined, ts.TypeFormatFlags.NoTruncation)
      : member.type.getText(sourceFile),
    jsdoc: readJsDoc(context.checker, member),
    paramsTypeText: signatureParamsTypeText(context.checker, signature),
    provenance: createProvenance({
      file: normalizeRepoPath(sourceFile.fileName, context.repoRoot),
      line,
      className,
      memberName,
      declarationKind: 'interface',
    }),
  }
}

function projectConstructor(command: ConstructorProjectionCommand): ConstructorMeta {
  const { site, member } = command
  const { context, sourceFile, className } = site
  const line = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
  const signature = context.checker.getSignatureFromDeclaration(member)
  if (signature === undefined) {
    throw new Error(`Missing constructor signature for ${className}`)
  }
  return {
    paramsSchema: paramsSchemaFromSignature(context.checker, signature),
    jsdoc: readJsDoc(context.checker, member),
    provenance: createProvenance({
      file: normalizeRepoPath(sourceFile.fileName, context.repoRoot),
      line,
      className,
      memberName: 'constructor',
      declarationKind: 'class',
    }),
  }
}

function registerModel(context: ProjectionContext, className: string, model: ClassModel): void {
  if (context.failOnDuplicate && context.models[className] !== undefined) {
    throw new Error(
      `Duplicate ClassModel className "${className}" from ${model.provenance?.file ?? 'unknown file'}`,
    )
  }
  context.models[className] = model
}

function fileIndexMerge(
  fileIndex: Record<string, string[]>,
  file: string,
  classNames: readonly string[],
): void {
  const existing = fileIndex[file] ?? []
  fileIndex[file] = [...existing, ...classNames]
}

function createDtsFileModuleSemanticMeta(command: DtsFileModuleSemanticCommand): DtsFileModuleSemanticMeta {
  const { repoRoot, sourceFile, sourcePath, symbols } = command
  const sourceFilePath = sourceFileFromDeclarationFile(sourcePath)
  const modulePath = inferModulePath(sourceFilePath)
  const packageName = inferPackageName(sourceFilePath)
  const name = packageName === undefined ? modulePath : `${packageName}:${modulePath}`
  const component = createModuleComponentProvenance(sourcePath, symbols)
  const leadingJsDoc = readLeadingModuleJsDoc(sourceFile)
  const sourceFileJsDoc = leadingJsDoc.length === 0
    ? readSourceFileModuleJsDoc(repoRoot, sourceFilePath)
    : ''
  const jsdocSource = leadingJsDoc.length > 0
    ? 'leading-jsdoc'
    : sourceFileJsDoc.length > 0 ? 'source-file-jsdoc' : 'inferred'
  return {
    name,
    sourcePath,
    sourceFile: sourceFilePath,
    ...(packageName === undefined ? {} : { packageName }),
    modulePath,
    jsdoc: leadingJsDoc.length > 0
      ? leadingJsDoc
      : sourceFileJsDoc.length > 0
        ? sourceFileJsDoc
        : inferModuleJsDoc({ name, packageName, modulePath, symbols, component }),
    jsdocSource,
    symbols,
    ...(component?.componentName === undefined ? {} : { componentName: component.componentName }),
    ...(component?.componentType === undefined ? {} : { componentType: component.componentType }),
    ...(component?.componentLevel === undefined ? {} : { componentLevel: component.componentLevel }),
    ...(component?.componentLayer === undefined ? {} : { componentLayer: component.componentLayer }),
    ...(component?.componentDirectory === undefined ? {} : { componentDirectory: component.componentDirectory }),
  }
}

function sourceFileFromDeclarationFile(declarationFile: string): string {
  const sourcePath = declarationFile.startsWith('declarations/')
    ? declarationFile.slice('declarations/'.length)
    : declarationFile
  if (sourcePath.endsWith('.vue.d.ts')) return sourcePath.slice(0, -'.d.ts'.length)
  if (sourcePath.endsWith('.d.ts')) return `${sourcePath.slice(0, -'.d.ts'.length)}.ts`
  return sourcePath
}

function inferPackageName(sourceFile: string): string | undefined {
  const packageMatch = /^packages\/([^/]+)\/src\//u.exec(sourceFile)
  if (packageMatch?.[1] !== undefined) return `@spark-appworks/${packageMatch[1]}`
  return sourceFile.startsWith('src/') ? 'app' : undefined
}

function inferModulePath(sourceFile: string): string {
  const withoutSourceRoot = sourceFile
    .replace(/^packages\/[^/]+\/src\//u, '')
    .replace(/^src\//u, '')
  return withoutSourceRoot
    .replace(/\.vue$/u, '')
    .replace(/\.ts$/u, '')
}

function createModuleComponentProvenance(
  sourcePath: string,
  symbols: readonly string[],
): ComponentProvenanceMeta | undefined {
  return createComponentProvenance(sourcePath, symbols[0] ?? '', undefined)
}

function readLeadingModuleJsDoc(sourceFile: ts.SourceFile): string {
  const firstStatement = sourceFile.statements[0]
  if (firstStatement === undefined) return ''
  const comments = (ts.getLeadingCommentRanges(sourceFile.text, 0) ?? [])
    .filter(comment => comment.kind === ts.SyntaxKind.MultiLineCommentTrivia)
    .map(comment => ({
      pos: comment.pos,
      end: comment.end,
      text: sourceFile.text.slice(comment.pos, comment.end),
    }))
    .filter(comment => comment.text.startsWith('/**'))
  if (comments.length === 0) return ''

  if (isModuleHeaderAnchor(firstStatement)) {
    return comments.map(comment => cleanJsDocBlock(comment.text)).join('\n\n').trim()
  }

  if (comments.length >= 2) {
    return cleanJsDocBlock(comments[0]?.text ?? '')
  }

  const only = comments[0]
  if (only === undefined) return ''
  const text = cleanJsDocBlock(only.text)
  return /(^|\s)@module\b|模块/u.test(text) ? text : ''
}

function isModuleHeaderAnchor(statement: ts.Statement): boolean {
  return ts.isImportDeclaration(statement)
    || ts.isImportEqualsDeclaration(statement)
    || ts.isExportDeclaration(statement)
}

function cleanJsDocBlock(text: string): string {
  return text
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

function readSourceFileModuleJsDoc(repoRoot: string, sourceFilePath: string): string {
  const text = ts.sys.readFile(resolve(repoRoot, sourceFilePath))
  if (text === undefined) return ''
  const normalized = text.replace(/^\uFEFF/u, '').trimStart()
  if (normalized.startsWith('/**')) {
    const end = normalized.indexOf('*/')
    if (end < 0) return ''
    return cleanJsDocBlock(normalized.slice(0, end + 2))
  }
  if (sourceFilePath.endsWith('.vue') && normalized.startsWith('<!--')) {
    const end = normalized.indexOf('-->')
    if (end < 0) return ''
    return cleanVueModuleComment(normalized.slice(0, end + 3))
  }
  return ''
}

function cleanVueModuleComment(text: string): string {
  return text
    .replace(/^<!--/u, '')
    .replace(/-->$/u, '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

function inferModuleJsDoc(input: {
  name: string
  packageName: string | undefined
  modulePath: string
  symbols: readonly string[]
  component: ComponentProvenanceMeta | undefined
}): string {
  const symbolsText = summarizeModuleSymbols(input.symbols)
  if (input.component !== undefined) {
    return [
      `${input.component.componentName ?? input.name} 模块，属于 SPARK component ${input.component.componentLevel}/${input.component.componentLayer}。`,
      `组件目录: ${input.component.componentDirectory ?? '<unknown>'}。`,
      symbolsText,
    ].join('\n')
  }
  return [
    `${input.packageName ?? 'workspace'} 的 ${input.modulePath} 模块。`,
    symbolsText,
  ].join('\n')
}

function summarizeModuleSymbols(symbols: readonly string[]): string {
  if (symbols.length === 0) return '该 DTS shard 当前不导出 ClassModel symbol。'
  const preview = symbols.length > 8
    ? `${symbols.slice(0, 8).join(', ')} 等`
    : symbols.join(', ')
  return `导出 ClassModel symbol: ${preview}（共 ${String(symbols.length)} 个 symbol）。`
}

function createProvenance(input: SourceProvenanceMeta): SourceProvenanceMeta {
  const component = createComponentProvenance(input.file, input.className, input.componentName)
  return component === undefined ? input : { ...input, ...component }
}

function normalizeRepoPath(absolutePath: string, repoRoot: string): string {
  return relative(repoRoot, absolutePath).replace(/\\/g, '/')
}

function createComponentProvenance(
  file: string,
  className: string,
  explicitComponentName: string | undefined,
): ComponentProvenanceMeta | undefined {
  const componentPath = readSparkComponentPath(file)
  if (componentPath === undefined) return undefined
  const classification = classifySparkComponentPath(componentPath)
  if (classification === undefined) return undefined
  const componentName = explicitComponentName ?? inferComponentNameFromPath(componentPath)
  const componentType = inferComponentType(className, componentName)
  return {
    ...(componentName === undefined ? {} : { componentName }),
    ...(componentType === undefined ? {} : { componentType }),
    componentLevel: classification.level,
    componentLayer: classification.layer,
    componentDirectory: classification.directory,
  }
}

function readSparkComponentPath(file: string): string | undefined {
  const marker = 'packages/spark-component/src/components/'
  const markerIndex = file.indexOf(marker)
  if (markerIndex < 0) return undefined
  return file.slice(markerIndex + marker.length)
}

function classifySparkComponentPath(componentPath: string): ComponentDirectoryClassification | undefined {
  const [domain, group] = componentPath.split('/')
  if (domain === 'containers') {
    if (group === 'data-views') {
      return {
        directory: 'containers/data-views',
        level: 'table-level',
        layer: 'data-view-container',
      }
    }
    if (group === 'layout') {
      return {
        directory: 'containers/layout',
        level: 'container',
        layer: 'layout-container',
      }
    }
    if (group === 'zones') {
      return {
        directory: 'containers/zones',
        level: 'container',
        layer: 'zone-container',
      }
    }
    return undefined
  }
  if (domain === 'fields') {
    if (group === 'data-components') {
      return {
        directory: 'fields/data-components',
        level: 'field-level',
        layer: 'data-field',
      }
    }
    if (group === 'non-data-components') {
      return {
        directory: 'fields/non-data-components',
        level: 'field-level',
        layer: 'field-support',
      }
    }
    return undefined
  }
  if (domain === 'display') {
    if (group === 'data-components') {
      return {
        directory: 'display/data-components',
        level: 'display',
        layer: 'data-display',
      }
    }
    if (group === 'non-data-components') {
      return {
        directory: 'display/non-data-components',
        level: 'display',
        layer: 'static-display',
      }
    }
    return undefined
  }
  if (domain === 'editors') {
    return {
      directory: 'editors',
      level: 'infrastructure',
      layer: 'editor',
    }
  }
  if (domain === 'support') {
    return {
      directory: 'support',
      level: 'infrastructure',
      layer: 'support',
    }
  }
  return undefined
}

function inferComponentNameFromPath(componentPath: string): string | undefined {
  const segments = componentPath.split('/')
  const fileName = segments.at(-1)
  if (fileName === undefined) return undefined
  const stem = fileName
    .replace(/\.d\.ts$/u, '')
    .replace(/\.(props|types|vue)$/u, '')
  if (isLikelyComponentName(stem)) return stem
  const parent = segments.at(-2)
  return parent !== undefined && isLikelyComponentName(parent) ? parent : undefined
}

function inferComponentType(className: string, componentName: string | undefined): string | undefined {
  const propsMatch = /^R(.+)Props$/u.exec(className)
  if (propsMatch !== null) {
    const propsName = propsMatch[1]
    if (propsName === undefined) return undefined
    if (propsName.startsWith('Display')) return `display-${toKebabCase(propsName.slice('Display'.length))}`
    return `r-${toKebabCase(propsName)}`
  }
  if (componentName === undefined) return undefined
  const explicit = SPECIAL_COMPONENT_TYPES[componentName]
  if (explicit !== undefined) return explicit
  if (componentName.startsWith('Renderer')) return `r-${toKebabCase(componentName.slice('Renderer'.length))}`
  if (componentName.startsWith('Field')) return `r-${toKebabCase(componentName.slice('Field'.length))}`
  if (componentName.startsWith('Display')) return `display-${toKebabCase(componentName.slice('Display'.length))}`
  return undefined
}

function isLikelyComponentName(value: string): boolean {
  return /^(Renderer|Field|Display|Spark|JsonTree|TreeNodeSummary|Unregistered)/u.test(value)
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/[\s_]+/gu, '-')
    .toLowerCase()
}

const SPECIAL_COMPONENT_TYPES: Readonly<Record<string, string>> = {
  DisplayText: 'r-text-display',
  SparkCodeEditor: 'code-editor',
  SparkJsonEditor: 'json-editor',
  TreeNodeSummary: 'r-tree-node-summary',
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
}

function hasReadonlyModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false)
}

function isPrivateMember(member: ts.ClassElement): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined
  if (modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword) === true) {
    return true
  }
  if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
    return member.name.text.startsWith('#')
  }
  if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
    return member.name.text.startsWith('#')
  }
  return false
}

function readMemberName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  return undefined
}

function readComponentNameFromPropsFile(file: string): string | undefined {
  const match = /\/([^/]+)\.props\.d\.ts$/.exec(file)
  return match?.[1]
}

function readJsDoc(checker: ts.TypeChecker, node: ts.Node): string {
  const symbol = checker.getSymbolAtLocation(node)
  if (symbol !== undefined) {
    return ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
  }
  const tags = ts.getJSDocCommentsAndTags(node)
  if (tags.length === 0) return ''
  return tags
    .map(tag => tag.getText().trim())
    .join('\n')
    .trim()
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => process.cwd(),
  getCanonicalFileName: fileName => fileName,
  getNewLine: () => '\n',
}
