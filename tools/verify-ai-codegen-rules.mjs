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

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
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

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runAiCodegenCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
