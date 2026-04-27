import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  GENERATE_BASE_PROMPT,
  UI_PHASE_PROMPT,
} from '../packages/spark-ai/src/business/project-planning/prompts/page-system-prompt'

describe('page-system-prompt SSoT', () => {
  it('uses current action and component discovery entries instead of legacy queryActionSpec capabilities', () => {
    const prompt = `${GENERATE_BASE_PROMPT}\n${UI_PHASE_PROMPT}`

    expect(prompt).not.toContain('queryActionSpec')
    expect(prompt).not.toMatch(/SparkNode\.[A-Za-z]/u)
    expect(prompt).toContain('stills.actionSpec')
    expect(prompt).toContain('queryComponentCatalog')
    expect(prompt).toContain('queryComponentGuide')
  })

  it('keeps current AI guides on catalog.query/catalog.guide instead of deleted SparkNode component entries', () => {
    const currentGuideText = [
      readFileSync(resolve(process.cwd(), '.github/copilot-instructions.md'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'docs/ai/SPARKNODE_BUILD_FLOW.md'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'docs/ai/architecture/DEVSYSTEM_DATASET_TOOL_SSOT.md'), 'utf8'),
    ].join('\n')

    expect(currentGuideText).not.toContain('SPARK_NODE_COMPONENT_ENTRIES')
    expect(currentGuideText).not.toContain('spark-node-component-catalog')
    expect(currentGuideText).not.toContain('SparkNode.containers')
    expect(currentGuideText).not.toContain('SparkNode.fields')
    expect(currentGuideText).not.toContain('queryActionSpec')
    expect(currentGuideText).not.toContain('projectFcDirectory')
    expect(currentGuideText).not.toContain('projectFcSpec')
    expect(currentGuideText).not.toContain('projectFcConfigGuide')
    expect(currentGuideText).not.toContain('packages/spark-ai/src/stills/dataset-crud-tool-stills-catalog.ts')
    expect(currentGuideText).not.toContain('packages/spark-ai/src/stills/edit-dataset-stills.ts')
    expect(currentGuideText).not.toContain('packages/spark-ai/src/stills/edit-domain.ts')
    expect(currentGuideText).not.toContain('tool-calling.ts')
    expect(currentGuideText).toContain('catalog.query')
    expect(currentGuideText).toContain('catalog.guide')
    expect(currentGuideText).toContain('stills.actionSpec')
    expect(currentGuideText).toContain('projectComponentDirectory')
    expect(currentGuideText).toContain('packages/spark-ai/src/business/page-design/stills/dataset-crud-tool-stills-catalog.ts')
  })
})
