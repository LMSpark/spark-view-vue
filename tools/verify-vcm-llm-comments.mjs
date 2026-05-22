#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import {
  collectSourceFiles,
  createDefaultExcluder,
  isCliEntrypoint,
  parseCliArgs,
  printViolations,
  relativePath,
} from './verifier-common.mjs'

const includeRoots = ['packages/spark-component/src/components']
const vcmExtensions = new Set(['.ts', '.vue'])

const componentTags = new Set([
  'skill',
  'skill-description',
  'description',
  'category',
  'catalogIgnore',
  'sparkCatalogIgnore',
  'catalogInternal',
  'internal',
  'configurable',
  'binding',
  'provides',
  'consumes',
  'notes',
])

const propTags = new Set([
  'internal',
  'default',
  'defaultValue',
  'example',
  'catalogExample',
  'enumValue',
  'param',
])

const machineReadablePropTags = new Set([
  'default',
  'defaultValue',
  'example',
  'catalogExample',
  'enumValue',
  'param',
])

const jsonLiteralTags = new Set(['default', 'defaultValue', 'example', 'catalogExample'])
const requiredTextComponentTags = new Set(['skill', 'description', 'skill-description', 'binding', 'provides', 'consumes', 'notes'])
const allowedCategories = new Set(['container', 'field', 'group', 'meta', 'feature', 'internal'])
const allowedConfigurableValues = new Set(['true', 'false', '1', '0', 'yes', 'no'])

const advertisingPhrases = [
  '强大',
  '极致',
  '完美',
  '一流',
  '领先',
  '革命性',
  '震撼',
  '高端',
  '高大上',
  '全能',
  '智能化',
  '开箱即用',
  '一站式',
  '超级',
  '最佳',
  '卓越',
]

const placeholderPattern = /TODO|TBD|待补充|待完善|随便|临时文案|广告文案/u
const skillTypePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u

export function scanVcmLlmComments(options = {}) {
  const root = options.root ?? process.cwd()
  const files = collectSourceFiles({
    root,
    includeRoots: options.includeRoots ?? includeRoots,
    includeFiles: options.includeFiles ?? [],
    extensions: vcmExtensions,
    exclude: createDefaultExcluder(root),
  })
  const violations = []

  for (const filePath of files) {
    const file = relativePath(root, filePath)
    const content = fs.readFileSync(filePath, 'utf8')
    if (file.endsWith('.vue')) {
      scanVueComponent({ content, file, violations })
    } else if (file.endsWith('.props.ts')) {
      scanPropsFile({ content, file, violations })
    }
  }

  return { files, violations }
}

export function runVcmLlmCommentCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { root: process.cwd(), includeRoots })
  if (args.help) {
    console.info('Usage: node tools/verify-vcm-llm-comments.mjs [--root DIR] [--include-root DIR]')
    return 0
  }

  const { files, violations } = scanVcmLlmComments(args)
  if (violations.length > 0) {
    printViolations('VCM LLM comment verification failed', violations)
    return 1
  }

  console.info(`VCM LLM comment verification passed: ${files.length} file(s) checked.`)
  return 0
}

function scanVueComponent({ content, file, violations }) {
  const scriptRange = findScriptRange(content)
  if (scriptRange === null) return

  const scriptBlocks = collectJsDocBlocks(content)
    .filter(block => block.start >= scriptRange.start && block.start < scriptRange.end)
  const skillBlocks = scriptBlocks.filter(block => hasTag(block, 'skill'))
  if (skillBlocks.length === 0) return

  const firstScriptBlock = scriptBlocks[0]
  const firstSkillBlock = skillBlocks[0]
  if (firstScriptBlock !== firstSkillBlock) {
    pushViolation(violations, file, firstSkillBlock.line, 'component @skill must be in the first JSDoc block after <script>; VCM consumes initial metadata only')
  }

  scanKnownTags(firstSkillBlock, componentTags, file, violations)
  scanComponentTags(firstSkillBlock, file, violations)
}

function scanPropsFile({ content, file, violations }) {
  for (const block of collectJsDocBlocks(content)) {
    if (!isPropDocBlock(content, block)) continue

    scanKnownTags(block, propTags, file, violations)
    scanPropTags(block, file, violations)
  }
}

function scanComponentTags(block, file, violations) {
  const skillTag = firstTag(block, 'skill')
  const descriptionTag = firstTag(block, 'description') ?? firstTag(block, 'skill-description')

  if (skillTag === undefined || skillTag.text.length === 0) {
    pushViolation(violations, file, block.line, 'component VCM block must declare @skill <kebab-type>')
  } else if (!skillTypePattern.test(skillTag.text)) {
    pushViolation(violations, file, skillTag.line, `@skill must be kebab-case, got "${skillTag.text}"`)
  }

  if (descriptionTag === undefined || descriptionTag.text.length === 0) {
    pushViolation(violations, file, block.line, 'component VCM block must include @description with LLM-facing semantics')
  } else {
    scanHumanText(descriptionTag.text, file, descriptionTag.line, '@description', violations)
  }

  for (const tag of block.tags) {
    if (requiredTextComponentTags.has(tag.name) && tag.text.length === 0) {
      pushViolation(violations, file, tag.line, `@${tag.name} requires text`)
    }
    if (tag.name === 'category' && !allowedCategories.has(tag.text)) {
      pushViolation(violations, file, tag.line, `@category must be one of: ${[...allowedCategories].join(', ')}`)
    }
    if (tag.name === 'configurable' && tag.text.length > 0 && !allowedConfigurableValues.has(tag.text.toLowerCase())) {
      pushViolation(violations, file, tag.line, '@configurable must be true/false/1/0/yes/no')
    }
    if (tag.name === 'notes') {
      scanHumanText(tag.text, file, tag.line, '@notes', violations)
    }
  }
}

function scanPropTags(block, file, violations) {
  const hasMachineTag = block.tags.some(tag => machineReadablePropTags.has(tag.name))
  if (hasMachineTag && block.summary.length === 0) {
    pushViolation(violations, file, block.line, 'VCM prop/emit tag block must start with a human summary before machine tags')
  }

  for (const line of block.summary) {
    scanHumanText(line, file, block.line, 'prop summary', violations)
  }

  for (const tag of block.tags) {
    if (jsonLiteralTags.has(tag.name)) {
      scanJsonLiteralTag(tag, file, violations)
    }
    if (tag.name === 'enumValue') {
      scanEnumValueTag(tag, file, violations)
    }
    if (tag.name === 'param' && tag.text.length === 0) {
      pushViolation(violations, file, tag.line, '@param requires "<name> <description>"')
    }
  }
}

function scanKnownTags(block, allowedTags, file, violations) {
  for (const tag of block.tags) {
    if (allowedTags.has(tag.name)) continue
    pushViolation(violations, file, tag.line, `unsupported VCM tag @${tag.name}; use documented catalog tags only`)
  }
}

function scanJsonLiteralTag(tag, file, violations) {
  if (tag.text.length === 0) {
    pushViolation(violations, file, tag.line, `@${tag.name} requires a JSON literal`)
    return
  }

  try {
    JSON.parse(tag.text)
  } catch {
    pushViolation(violations, file, tag.line, `@${tag.name} must be a JSON literal: ${tag.text}`)
  }
}

function scanEnumValueTag(tag, file, violations) {
  const match = /^(\S+)\s+(.+)$/u.exec(tag.text)
  if (match === null) {
    pushViolation(violations, file, tag.line, '@enumValue requires "<value> <title>: <description>"')
    return
  }

  const body = match[2] ?? ''
  if (!/[：:-]/u.test(body)) {
    pushViolation(violations, file, tag.line, '@enumValue text must include a title separator (:, ：, or -)')
  }
  scanHumanText(body, file, tag.line, '@enumValue', violations)
}

function scanHumanText(text, file, line, label, violations) {
  if (placeholderPattern.test(text)) {
    pushViolation(violations, file, line, `${label} contains placeholder text`)
  }

  for (const phrase of advertisingPhrases) {
    if (text.includes(phrase)) {
      pushViolation(violations, file, line, `${label} contains advertising phrase "${phrase}"; describe behavior, binding, or constraints instead`)
    }
  }
}

function isPropDocBlock(content, block) {
  if (block.tags.some(tag => propTags.has(tag.name))) return true
  const nextText = content.slice(block.end, block.end + 240)
  return /^\s*(?:readonly\s+)?(?:[A-Za-z_$][\w$]*|['"][^'"]+['"])\??\s*:/u.test(nextText)
}

function collectJsDocBlocks(content) {
  const blocks = []
  const pattern = /\/\*\*[\s\S]*?\*\//gu
  let match

  while ((match = pattern.exec(content)) !== null) {
    const raw = match[0]
    blocks.push(parseJsDocBlock(content, raw, match.index, pattern.lastIndex))
  }

  return blocks
}

function parseJsDocBlock(content, raw, start, end) {
  const line = lineNumberAt(content, start)
  const body = raw.slice(3, -2)
  const lines = body
    .split(/\r?\n/u)
    .map(item => item.replace(/^\s*\*\s?/u, '').trim())

  const tags = []
  const summary = []
  let seenTag = false

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    if (text.length === 0) continue

    const tagMatch = /^@([A-Za-z][\w-]*)(?:\s+(.+))?$/u.exec(text)
    if (tagMatch !== null) {
      seenTag = true
      tags.push({
        name: tagMatch[1],
        text: (tagMatch[2] ?? '').trim(),
        line: line + index,
      })
      continue
    }

    if (!seenTag) {
      summary.push(text)
    }
  }

  return { raw, start, end, line, lines, tags, summary }
}

function findScriptRange(content) {
  const openMatch = /<script\b[^>]*>/iu.exec(content)
  if (openMatch === null) return null

  const start = openMatch.index + openMatch[0].length
  const closeIndex = content.indexOf('</script>', start)
  return {
    start,
    end: closeIndex >= 0 ? closeIndex : content.length,
  }
}

function hasTag(block, name) {
  return block.tags.some(tag => tag.name === name)
}

function firstTag(block, name) {
  return block.tags.find(tag => tag.name === name)
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/u).length
}

function pushViolation(violations, file, line, message) {
  violations.push({ file, line, message })
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runVcmLlmCommentCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
