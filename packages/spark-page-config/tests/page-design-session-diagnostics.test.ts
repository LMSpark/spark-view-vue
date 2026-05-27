import { describe, expect, it } from 'vitest'

import type { AiAgentSessionRecord } from '@spark-view/spark-ai/agent'
import {
  componentTypesFromPageDesignRule,
  validatePageDesignPayloadGuidesFromSession,
} from '../src/ai/index'

// ── Fixture ─────────────────────────────────────────────────

function sessionRecord(): AiAgentSessionRecord {
  return {
    moduleId: 'pageDesign',
    moduleInstanceId: 'page-a',
    instanceId: 'page-a',
    runtimeInstanceId: 'page-a',
    status: 'Started',
    startedAt: 1000,
    updatedAt: 2000,
    history: [
      {
        kind: 'functionCall',
        moduleId: 'pageDesign',
        moduleInstanceId: 'page-a',
        instanceId: 'page-a',
        runtimeInstanceId: 'page-a',
        id: 'f1',
        seq: 1,
        timestamp: 1000,
        toolName: 'pageDesign_payload-catalog_guidePayload',
        args: {
          $paths: ['page-a', 'page-a'],
          key: 'r-form',
        },
        status: 'completed',
        result: { ok: true },
      },
    ],
  }
}

// ── Assertions ──────────────────────────────────────────────

describe('pageDesign session diagnostics', () => {
  it('collects component payload types from rule.json without page-specific semantics', () => {
    const files = {
      'rule.json': JSON.stringify({
        type: 'page',
        id: 'page',
        children: [
          { type: 'r-form', id: 'form', props: {} },
          { type: 'r-button', id: 'button', props: {} },
          { type: 'div', id: 'native', props: {} },
        ],
      }),
    }

    expect(componentTypesFromPageDesignRule(files)).toEqual(['r-button', 'r-form'])
  })

  it('checks explicit guidePayload evidence for catalog components', () => {
    const files = {
      'rule.json': JSON.stringify({
        type: 'page',
        id: 'page',
        children: [
          { type: 'r-form', id: 'form', props: {} },
          { type: 'r-button', id: 'button', props: {} },
        ],
      }),
    }

    expect(validatePageDesignPayloadGuidesFromSession(files, sessionRecord())).toEqual({
      ok: false,
      componentTypes: ['r-button', 'r-form'],
      guidedPayloadKeys: ['r-form'],
      missingGuides: ['r-button'],
    })
  })
})
