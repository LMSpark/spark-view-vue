import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()

const includeRoots = ['packages', 'src', 'tests', '.storybook', 'tools']
const includeFiles = [
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.spark-ai.config.ts',
]
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue'])

const interfaceAllowlist = new Set([
  'packages/spark-utils/src/capability/core.ts:CapabilityTypeMap',
  'packages/spark-page-config/src/page/services/app-services.ts:CapabilityTypeMap',
  'packages/spark-component/src/core/capability-keys.ts:CapabilityTypeMap',
])

function relativePath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/')
}

function isExcluded(filePath) {
  const rel = relativePath(filePath)
  return rel.startsWith('packages/vxe-table/')
    || rel === 'packages/vxe-table'
    || rel.startsWith('spark-ai-server/')
    || rel === 'spark-ai-server'
    || rel.startsWith('vue-virtual-card-scroll-demo/')
    || rel === 'vue-virtual-card-scroll-demo'
    || rel.startsWith('dist/')
    || rel.includes('/dist/')
    || rel.includes('/node_modules/')
    || rel.endsWith('/component-catalog.json')
    || rel.endsWith('/component-metadata.json')
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (isExcluded(fullPath)) continue

    if (entry.isDirectory()) {
      yield* walk(fullPath)
      continue
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      yield fullPath
    }
  }
}

function collectFiles() {
  const files = []
  const seen = new Set()

  for (const includeRoot of includeRoots) {
    for (const file of walk(path.join(root, includeRoot))) {
      const rel = relativePath(file)
      if (!seen.has(rel)) {
        seen.add(rel)
        files.push(file)
      }
    }
  }

  for (const file of includeFiles) {
    const fullPath = path.join(root, file)
    if (!fs.existsSync(fullPath) || isExcluded(fullPath)) continue
    const rel = relativePath(fullPath)
    if (!seen.has(rel)) {
      seen.add(rel)
      files.push(fullPath)
    }
  }

  return files.sort((left, right) => relativePath(left).localeCompare(relativePath(right)))
}

function extractVueScripts(source) {
  const scripts = []
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/giu
  let match

  while ((match = scriptPattern.exec(source)) !== null) {
    const content = match[1] ?? ''
    const start = match.index + (match[0].indexOf(content))
    const lineOffset = source.slice(0, start).split(/\r?\n/u).length - 1
    scripts.push({ content, lineOffset })
  }

  return scripts
}

function lineFor(sourceFile, node, lineOffset) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 + lineOffset
}

function formatViolation(violation) {
  return `${violation.file}:${violation.line} ${violation.message}`
}

function scanSource(source, file, scriptKind, lineOffset, violations) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind)

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

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function scanFile(filePath, violations) {
  const rel = relativePath(filePath)
  const source = fs.readFileSync(filePath, 'utf8')

  if (filePath.endsWith('.vue')) {
    for (const script of extractVueScripts(source)) {
      scanSource(script.content, rel, ts.ScriptKind.TSX, script.lineOffset, violations)
    }
    return
  }

  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  scanSource(source, rel, scriptKind, 0, violations)
}

const violations = []
const files = collectFiles()
for (const file of files) {
  scanFile(file, violations)
}

if (violations.length > 0) {
  console.error(`AI codegen rule scan failed: ${violations.length} violation(s).`)
  for (const violation of violations.slice(0, 200)) {
    console.error(`  ${formatViolation(violation)}`)
  }
  if (violations.length > 200) {
    console.error(`  ... ${violations.length - 200} more violation(s)`)
  }
  process.exit(1)
}

console.info(`AI codegen rule scan passed: ${files.length} file(s) checked.`)
