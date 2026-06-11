import { relative, resolve } from 'node:path'

import ts from 'typescript'

import {
  DTS_CLASS_MODEL_SURFACE_VERSION,
  type DtsClassModelSurfaceDocument,
  type ProjectDtsClassModelSurfaceOptions,
} from './dts-surface-types'
import {
  DTS_FILE_PROJECTION_VERSION,
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

  const context: ProjectionContext = {
    checker,
    repoRoot,
    exportedOnly: options.exportedOnly ?? false,
    failOnDuplicate: false,
    models: {},
    fileIndex: {},
  }
  const symbols: string[] = []
  ts.forEachChild(sourceFile, node => {
    const className = projectTopLevelDeclaration(context, sourceFile, node)
    if (className !== undefined) symbols.push(className)
  })

  return {
    schemaVersion: DTS_FILE_PROJECTION_VERSION,
    sourcePath: normalizeRepoPath(absolutePath, repoRoot),
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
    return projectClassLike({
      site: projectionSite(context, sourceFile, name),
      node,
      shapeKind: 'class',
    })
  }
  if (ts.isInterfaceDeclaration(node)) {
    const name = readDeclarationName(node)
    if (name === undefined) return undefined
    return projectClassLike({
      site: projectionSite(context, sourceFile, name),
      node,
      shapeKind: 'interface',
    })
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return projectTypeAlias(context, sourceFile, node)
  }
  if (ts.isEnumDeclaration(node)) {
    return projectEnum(context, sourceFile, node)
  }
  return undefined
}

function readDeclarationName(node: ts.ClassDeclaration | ts.InterfaceDeclaration): string | undefined {
  return node.name?.text
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
    ...(attributes.length === 0 ? { declarationTypeText: typeText } : {}),
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

function attributesFromObjectSchema(command: ObjectSchemaAttributesCommand): AttributeMeta[] {
  const { site, schema, typeNode } = command
  const { context, sourceFile, className } = site
  if (schema === true || schema === false || typeof schema !== 'object' || Array.isArray(schema)) {
    return []
  }
  if (schema.properties === undefined) {
    if (ts.isTypeLiteralNode(typeNode)) {
      return typeLiteralAttributes({ site, typeNode })
    }
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

function createProvenance(input: SourceProvenanceMeta): SourceProvenanceMeta {
  return input
}

function normalizeRepoPath(absolutePath: string, repoRoot: string): string {
  return relative(repoRoot, absolutePath).replace(/\\/g, '/')
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
