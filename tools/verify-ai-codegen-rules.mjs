#!/usr/bin/env node

import process from 'node:process'
import ts from 'typescript'
import {
  collectModuleReferences,
  collectSourceFiles,
  createDefaultExcluder,
  forEachParsedSource,
  isCliEntrypoint,
  lineFor,
  parseCliArgs,
  printViolations,
} from './verifier-common.mjs'

const includeRoots = ['packages', 'src', 'tests', '.storybook', 'tools']
const includeFiles = [
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.spark-ai.config.ts',
]

const interfaceAllowlist = new Set([
  'packages/spark-utils/src/capability/core.ts:CapabilityTypeMap',
  'packages/spark-page-config/src/page/services/app-services.ts:CapabilityTypeMap',
  'packages/spark-page-config/src/runtime/app-services.ts:CapabilityTypeMap',
  'packages/spark-component/src/core/capability-keys.ts:CapabilityTypeMap',
  // Host session-types and transport-types are complete type-contract modules;
  // topic-based re-export files add artificial indirection.
  'packages/spark-ai/src/host/index.ts:./session/session-types',
  'packages/spark-ai/src/index.ts:./host/session/session-types',
  'packages/spark-ai/src/host/index.ts:./transport/transport-types',
  'packages/spark-ai/src/index.ts:./host/transport/transport-types',
])

const allowedSparkAiSpecifiers = new Set([
  '@spark-view/spark-ai',
  '@spark-view/spark-ai/schema',
  '@spark-view/spark-ai/host',
  '@spark-view/spark-ai/module-semantic',
])

const forbiddenModuleKindMembers = new Set([
  'ActionFailureMode',
  'ActionMetadata',
  'ActionResultSchema',
  'ActionSchema',
  'AttributeAccess',
  'AttributeMetadata',
  'AttributeSchema',
  'CheckEntry',
  'ChildrenLister',
  'HostContext',
  'InstanceFinder',
  'InstanceQuery',
  'InstanceRef',
  'KindOperation',
  'Options',
  'OperationResult',
  'OperationResultOptions',
  'PathContext',
  'Runner',
])

const forbiddenLegacyIdentifiers = new Set([
  'ActionSchema',
  'AttributeSchema',
  'JsonSchemaProperties',
  'LlmParameterSchemaRoot',
  'ModuleModuleAction',
])

const maxNamedImportsPerWorkspaceModule = 8
const maxPublicSurfaceExportsPerModule = 8
const maxLayeringExportsPerModule = 3
const maxDefaultPositionalSignatureParams = 3
const maxConstructorParameterPropertyParams = 4

const publicSurfaceAllowlist = new Set([
  // Schema builders intentionally expose paired value builders and Options types:
  // the Options names keep public function signatures short without hiding contracts.
  'packages/spark-ai/src/index.ts:./schema/schema-builders-api',
  'packages/spark-ai/src/schema/index.ts:./schema-builders-api',
  // Host session-types and transport-types are complete type-contract modules;
  // topic-based re-export files add artificial indirection.
  'packages/spark-ai/src/host/index.ts:./session/session-types',
  'packages/spark-ai/src/index.ts:./host/session/session-types',
  'packages/spark-ai/src/host/index.ts:./transport/transport-types',
  'packages/spark-ai/src/index.ts:./host/transport/transport-types',
])

const publicClassMethodSurfaces = new Map([
  ['packages/spark-ai/src/module-semantic/runtime/module-semantic-runtime.ts:ModuleSemanticRuntime', new Set([
    'registerKind',
    'getLlmTools',
    'executeTool',
    'getAttribute',
    'setAttribute',
    'invokeFunction',
    'listChildren',
    'findInstance',
    'describeKind',
    'projectKnowledge',
    'queryKnowledgeModules',
    'queryKnowledgeFunctions',
    'guideKnowledgeFunction',
  ])],
])

const layeringExportSuffixPattern = /(?:Provider|Resolver|Adapter|Factory|Context|Options|Interface|Impl)$/u
const mechanicalNameSuffixPattern = /(?:Interface|Impl)$/u
const repeatedRoleTypeSuffixPattern = /(?:Context|Options|Provider|Resolver|Adapter|Factory|Interface|Impl)$/u
const multiWordTypeNamePattern = /[a-z][A-Z]/u

export function scanAiCodegenRules(options = {}) {
  const root = options.root ?? process.cwd()
  const files = collectSourceFiles({
    root,
    includeRoots: options.includeRoots ?? includeRoots,
    includeFiles: options.includeFiles ?? includeFiles,
    exclude: createDefaultExcluder(root),
  })
  const violations = []

  for (const filePath of files) {
    forEachParsedSource(filePath, root, (parsed) => {
      scanSource(parsed, violations)
    })
  }

  return { files, violations }
}

export function runAiCodegenCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { root: process.cwd(), includeRoots, includeFiles })
  if (args.help) {
    console.info('Usage: node tools/verify-ai-codegen-rules.mjs [--root DIR] [--include-root DIR] [--include-file FILE]')
    return 0
  }

  const { files, violations } = scanAiCodegenRules(args)
  if (violations.length > 0) {
    printViolations('AI codegen rule scan failed', violations)
    return 1
  }

  console.info(`AI codegen rule scan passed: ${files.length} file(s) checked.`)
  return 0
}

function scanSource(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed

  scanNamedImportConvergence(parsed, violations)
  scanPublicSurfaceConvergence(parsed, violations)
  scanPublicClassMethodSurfaces(parsed, violations)
  scanSignatureConventions(parsed, violations)

  for (const ref of collectModuleReferences(sourceFile)) {
    if (isForbiddenSparkAiSpecifier(ref.specifier)) {
      violations.push({
        file,
        line: lineFor(sourceFile, ref.node, lineOffset),
        message: `forbidden @spark-view/spark-ai subpath: ${ref.specifier}`,
      })
    }
  }

  function visit(node) {
    if (ts.isAsExpression(node)) {
      const typeText = node.type.getText(sourceFile)
      if (typeText !== 'const') {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `type assertion is forbidden: ${node.getText(sourceFile).replace(/\s+/gu, ' ').slice(0, 160)}`,
        })
      }
    }

    if (ts.isTypeAssertionExpression(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `angle-bracket type assertion is forbidden: ${node.getText(sourceFile).replace(/\s+/gu, ' ').slice(0, 160)}`,
      })
    }

    if (ts.isInterfaceDeclaration(node)) {
      const key = `${file}:${node.name.text}`
      if (!interfaceAllowlist.has(key)) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `interface declaration is forbidden outside allowlist: ${node.name.text}`,
        })
      }
    }

    if (isForbiddenNamespaceDeclaration(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `TypeScript namespace declaration is forbidden: ${node.name.getText(sourceFile)}`,
      })
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && node.exportClause === undefined) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: 'export * is forbidden; public surfaces must use explicit export lists',
      })
    }

    if (isForbiddenModuleKindAccess(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `legacy ModuleKind namespace member is forbidden: ${node.getText(sourceFile)}`,
      })
    }

    if (ts.isIdentifier(node) && forbiddenLegacyIdentifiers.has(node.text)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `legacy AI type name is forbidden: ${node.text}`,
      })
    }

    if (hasMechanicalDeclarationName(node)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `mechanical Interface/Impl name is forbidden: ${node.name.text}`,
      })
    }

    if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && isMechanicalName(node.name.text)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `mechanical Interface/Impl import/export is forbidden: ${node.name.text}`,
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function scanNamedImportConvergence(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (isTestFile(file)) return

  const importsByModule = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue

    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('@spark-view/')) continue

    const key = `${file}:${specifier}`
    let entry = importsByModule.get(key)
    if (entry === undefined) {
      entry = { specifier, names: new Set(), node: statement }
      importsByModule.set(key, entry)
    }

    for (const element of statement.importClause.namedBindings.elements) {
      entry.names.add((element.propertyName ?? element.name).text)
    }
  }

  for (const [key, entry] of importsByModule) {
    const count = entry.names.size
    if (count <= maxNamedImportsPerWorkspaceModule) continue

    violations.push({
      file,
      line: lineFor(sourceFile, entry.node, lineOffset),
      message: `too many named imports from ${entry.specifier}: ${count}; use a module facade or main object instead of a flat import list`,
    })
  }
}

function scanPublicSurfaceConvergence(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (!isProtocolPublicSurfaceFile(file)) return

  const exportsByModule = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) continue

    const specifier = statement.moduleSpecifier !== undefined && ts.isStringLiteralLike(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : '<local>'
    const key = `${file}:${specifier}`
    let entry = exportsByModule.get(key)
    if (entry === undefined) {
      entry = { specifier, names: new Set(), layeringNames: new Set(), node: statement }
      exportsByModule.set(key, entry)
    }

    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text
      entry.names.add(exportedName)
      if (isLayeringExportName(exportedName)) {
        entry.layeringNames.add(exportedName)
      }
    }
  }

  for (const [key, entry] of exportsByModule) {
    if (publicSurfaceAllowlist.has(key)) continue

    const nameCount = entry.names.size
    const layeringCount = entry.layeringNames.size
    const exceedsThreshold = nameCount > maxPublicSurfaceExportsPerModule
      || layeringCount > maxLayeringExportsPerModule

    if (!exceedsThreshold) continue

    violations.push({
      file,
      line: lineFor(sourceFile, entry.node, lineOffset),
      message: `flat public surface from ${entry.specifier}: ${nameCount} export(s), ${layeringCount} Provider/Resolver/Adapter/Factory/Context/Options export(s); expose a smaller facade or main object`,
    })
  }
}

function scanPublicClassMethodSurfaces(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      const key = `${file}:${node.name.text}`
      const allowed = publicClassMethodSurfaces.get(key)
      if (allowed !== undefined) {
        const actual = new Set()
        for (const member of node.members) {
          const methodName = publicCallableMemberName(member)
          if (methodName !== null) actual.add(methodName)
        }

        const extra = [...actual].filter((name) => !allowed.has(name)).sort()
        const missing = [...allowed].filter((name) => !actual.has(name)).sort()
        if (extra.length > 0 || missing.length > 0) {
          violations.push({
            file,
            line: lineFor(sourceFile, node, lineOffset),
            message: `public method surface drift for ${node.name.text}; extra=[${extra.join(', ')}] missing=[${missing.join(', ')}]`,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function scanSignatureConventions(parsed, violations) {
  const { file, sourceFile, lineOffset } = parsed
  if (isTestFile(file)) return

  function visit(node) {
    const signatureName = functionLikeName(node, sourceFile)
    const parameterLimit = positionalParameterLimit(node)
    if (signatureName !== null && node.parameters.length > parameterLimit) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: `signature has too many positional parameters: ${signatureName} has ${node.parameters.length}, limit is ${parameterLimit}; use a named options object or domain command object`,
      })
    }

    if (ts.isParameter(node) && hasParameterJSDoc(node, sourceFile)) {
      violations.push({
        file,
        line: lineFor(sourceFile, node, lineOffset),
        message: 'parameter JSDoc is forbidden; move the comment to the options type, class field, or function JSDoc',
      })
    }

    if (ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      if (enforcesOptionalUndefinedConvention(file) && hasOptionalUndefinedUnion(node)) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: 'optional field should not include an outer | undefined; omit the property when no value is present',
        })
      }

      const repeatedRoleName = repeatedTypeRoleName(node)
      if (repeatedRoleName !== null) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `signature name repeats its type name: ${repeatedRoleName}; use a role name like context, options, request, or result`,
        })
      }
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const aliasTarget = thinTypeAliasTarget(node.type)
      if (aliasTarget !== null) {
        violations.push({
          file,
          line: lineFor(sourceFile, node, lineOffset),
          message: `thin type alias is forbidden: ${node.name.text} = ${aliasTarget}; use the original type or define a real domain shape`,
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function positionalParameterLimit(node) {
  if (ts.isConstructorDeclaration(node) && hasConstructorParameterProperty(node)) {
    return maxConstructorParameterPropertyParams
  }
  return maxDefaultPositionalSignatureParams
}

function hasConstructorParameterProperty(node) {
  return node.parameters.some((parameter) => {
    return parameter.modifiers?.some((modifier) => {
      return modifier.kind === ts.SyntaxKind.PublicKeyword
        || modifier.kind === ts.SyntaxKind.PrivateKeyword
        || modifier.kind === ts.SyntaxKind.ProtectedKeyword
        || modifier.kind === ts.SyntaxKind.ReadonlyKeyword
    }) === true
  })
}

function hasParameterJSDoc(node, sourceFile) {
  return /\/\*\*[\s\S]*?\*\//u.test(node.getFullText(sourceFile))
}

function hasOptionalUndefinedUnion(node) {
  return node.questionToken !== undefined
    && node.type !== undefined
    && unionContainsUndefined(unwrapParenthesizedType(node.type))
}

function unionContainsUndefined(typeNode) {
  return ts.isUnionTypeNode(typeNode)
    && typeNode.types.some((part) => unwrapParenthesizedType(part).kind === ts.SyntaxKind.UndefinedKeyword)
}

function unwrapParenthesizedType(typeNode) {
  let current = typeNode
  while (ts.isParenthesizedTypeNode(current)) {
    current = current.type
  }
  return current
}

function functionLikeName(node, sourceFile) {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) {
    return node.name !== undefined && ts.isIdentifier(node.name) ? node.name.text : null
  }

  if (ts.isConstructorDeclaration(node)) {
    return 'constructor'
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text
    }
    if (ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) {
      return parent.left.text
    }
  }

  if (isFunctionLikeWithParameters(node)) {
    return null
  }

  return null
}

function publicCallableMemberName(member) {
  if (
    !ts.isMethodDeclaration(member)
    && !ts.isGetAccessorDeclaration(member)
    && !ts.isSetAccessorDeclaration(member)
  ) {
    return null
  }
  if (!ts.isIdentifier(member.name) || hasNonPublicModifier(member)) return null
  return member.name.text
}

function hasNonPublicModifier(node) {
  return (node.modifiers ?? []).some((modifier) =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
    || modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  )
}

function repeatedTypeRoleName(node) {
  if (!ts.isIdentifier(node.name)) return null

  const typeName = typeReferenceName(node.type)
  if (typeName === null) return null
  if (!multiWordTypeNamePattern.test(typeName) || !repeatedRoleTypeSuffixPattern.test(typeName)) return null

  const roleName = node.name.text
  return roleName === lowerCamelCase(typeName) ? `${roleName}=${typeName}` : null
}

function thinTypeAliasTarget(typeNode) {
  if (!ts.isTypeReferenceNode(typeNode) || typeNode.typeArguments !== undefined) return null
  return typeReferenceName(typeNode)
}

function typeReferenceName(typeNode) {
  if (typeNode === undefined || !ts.isTypeReferenceNode(typeNode)) return null
  if (ts.isIdentifier(typeNode.typeName)) return typeNode.typeName.text
  return null
}

function isForbiddenSparkAiSpecifier(specifier) {
  return specifier.startsWith('@spark-view/spark-ai/')
    && !allowedSparkAiSpecifiers.has(specifier)
}

function isForbiddenNamespaceDeclaration(node) {
  return ts.isModuleDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text !== 'global'
}

function isForbiddenModuleKindAccess(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.expression.getText() === 'ModuleKind' && forbiddenModuleKindMembers.has(node.name.text)
  }
  if (ts.isQualifiedName(node)) {
    return node.left.getText() === 'ModuleKind' && forbiddenModuleKindMembers.has(node.right.text)
  }
  return false
}

function isFunctionLikeWithParameters(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isArrowFunction(node)
    || ts.isFunctionExpression(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
}

function lowerCamelCase(name) {
  return name.length === 0 ? name : `${name[0].toLowerCase()}${name.slice(1)}`
}

function hasMechanicalDeclarationName(node) {
  return (
    ts.isClassDeclaration(node)
    || ts.isFunctionDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node)
  )
    && node.name !== undefined
    && isMechanicalName(node.name.text)
}

function isMechanicalName(name) {
  return mechanicalNameSuffixPattern.test(name)
}

function isLayeringExportName(name) {
  return layeringExportSuffixPattern.test(name)
}

function isProtocolPublicSurfaceFile(file) {
  return file.endsWith('/index.ts')
    && (
      file.startsWith('packages/spark-ai/src/')
      || file.startsWith('packages/spark-page-config/src/')
    )
}

function isTestFile(file) {
  return file.startsWith('tests/')
    || file.includes('/tests/')
    || file.includes('/__tests__/')
    || file.endsWith('.test.ts')
    || file.endsWith('.test.tsx')
    || file.endsWith('.spec.ts')
    || file.endsWith('.spec.tsx')
}

function enforcesOptionalUndefinedConvention(file) {
  return file.startsWith('packages/spark-ai/src/')
    || file.startsWith('packages/spark-page-config/src/ai/')
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runAiCodegenCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
