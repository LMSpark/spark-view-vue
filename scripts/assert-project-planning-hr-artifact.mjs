#!/usr/bin/env node
/**
 * L4 HR projectPlanning artifact validator.
 *
 * Usage:
 *   node scripts/assert-project-planning-hr-artifact.mjs [artifact.json]
 *   node scripts/assert-project-planning-hr-artifact.mjs --min-coverage-ratio 0.6 e2e-project-planning-hr-last.json
 *
 * Prerequisites:
 *   - L3 smoke completed with status=completed
 *   - Host Run returned result.projectPlanning.navigationRoot (any save mode)
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertProjectPlanningHrArtifact } from './lib/project-planning-hr-artifact-assert.mjs'

const DEFAULT_ARTIFACT = 'e2e-project-planning-hr-last.json'

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const artifactPath = resolve(process.cwd(), options.artifact)
  const text = await readFile(artifactPath, 'utf8')
  const artifact = JSON.parse(text)
  const report = assertProjectPlanningHrArtifact(artifact, {
    minChildren: options.minChildren,
    minCoverageRatio: options.minCoverageRatio,
    requireNavigationRoot: options.requireNavigationRoot,
  })

  const output = {
    ok: report.ok,
    artifact: artifactPath,
    summary: report.summary,
    findings: report.findings,
  }
  console.log(JSON.stringify(output, null, 2))

  if (!report.ok) {
    process.exitCode = 1
  }
}

function parseArgs(args) {
  const options = {
    artifact: DEFAULT_ARTIFACT,
    minChildren: 3,
    minCoverageRatio: 0.7,
    requireNavigationRoot: true,
  }

  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case '--min-children':
        options.minChildren = readPositiveInteger(readNext(args, ++index, arg), arg)
        break
      case '--min-coverage-ratio':
        options.minCoverageRatio = readRatio(readNext(args, ++index, arg), arg)
        break
      case '--allow-missing-navigation':
        options.requireNavigationRoot = false
        break
      default:
        positional.push(arg)
    }
  }

  if (positional[0] !== undefined) {
    options.artifact = positional[0]
  }
  return options
}

function readNext(args, index, flag) {
  const value = args[index]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function readPositiveInteger(value, flag) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsed
}

function readRatio(value, flag) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`${flag} must be a number in (0, 1]`)
  }
  return parsed
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
