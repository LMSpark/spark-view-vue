import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  assertProjectPlanningHrArtifact,
  walkNavigationNodes,
} from '../../scripts/lib/project-planning-hr-artifact-assert.mjs'

const FIXTURE_PASS = path.resolve('tests/fixtures/project-planning-hr-artifact/minimal-pass.json')
describe('projectPlanning HR artifact assert (L4)', () => {
  it('walkNavigationNodes flattens nested children', () => {
    const root = {
      id: 'root',
      title: 'Root',
      nodeKind: 'module',
      children: [
        { id: 'a', title: 'A', nodeKind: 'page', path: '/a' },
        {
          id: 'b',
          title: 'B',
          nodeKind: 'module',
          children: [{ id: 'b1', title: 'B1', nodeKind: 'page', path: '/b1' }],
        },
      ],
    }
    expect(walkNavigationNodes(root).map(node => node['id'])).toEqual(['root', 'a', 'b', 'b1'])
  })

  it('passes relaxed HR planning fixture', async () => {
    const artifact = JSON.parse(await readFile(FIXTURE_PASS, 'utf8'))
    const report = assertProjectPlanningHrArtifact(artifact, { minCoverageRatio: 0.6 })
    expect(report.ok).toBe(true)
    expect(report.summary.fail).toBe(0)
  })

  it('ignores pageDesign markers that only appear in VCM guide result summaries', async () => {
    const artifact = JSON.parse(await readFile(FIXTURE_PASS, 'utf8'))
    artifact.result.toolCalls = [
      {
        toolName: 'vcm_action_guide',
        argsPreview: JSON.stringify({ kind: 'project', actionName: 'readProjectPlanningInput' }),
        resultSummary: 'ProjectModel docs mention openPageDesign as unrelated model knowledge.',
      },
      {
        toolName: 'vcm_script',
        argsPreview: JSON.stringify({ script: 'return await this.replaceNavigationChildren({ children: [] })' }),
      },
    ]

    const report = assertProjectPlanningHrArtifact(artifact, { minCoverageRatio: 0.6 })
    expect(report.ok).toBe(true)
    expect(report.findings.find(item => item.check === 'stage.pageDesign')?.level).toBe('pass')
  })

  it('fails when pageDesign markers appear in executed tool arguments', async () => {
    const artifact = JSON.parse(await readFile(FIXTURE_PASS, 'utf8'))
    artifact.result.toolCalls = [
      {
        toolName: 'vcm_script',
        argsPreview: JSON.stringify({ script: 'await this.openPageDesign("demo")' }),
      },
    ]

    const report = assertProjectPlanningHrArtifact(artifact, { minCoverageRatio: 0.6 })
    expect(report.ok).toBe(false)
    expect(report.findings.find(item => item.check === 'stage.pageDesign')?.level).toBe('fail')
  })

  it('fails when host run did not complete', async () => {
    const artifact = {
      result: {
        status: 'failed',
        error: { message: 'boom' },
      },
    }
    const report = assertProjectPlanningHrArtifact(artifact)
    expect(report.ok).toBe(false)
    expect(report.findings.some(item => item.check === 'host-run.status')).toBe(true)
  })

  it('CLI validates fixture with JSON output', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/assert-project-planning-hr-artifact.mjs', FIXTURE_PASS, '--min-coverage-ratio', '0.6'],
      {
        cwd: path.resolve('.'),
        encoding: 'utf8',
        shell: false,
      },
    )

    expect(result.status).toBe(0)
    const payload = JSON.parse(result.stdout) as { ok?: boolean }
    expect(payload.ok).toBe(true)
  })
})
