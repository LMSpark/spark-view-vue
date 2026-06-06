import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { resetAppProjectWorkspace } from '@/services/project-workspace'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
  resolvePageDesignEditor,
} from '@/services/page-design-editor-provider'
import { getAppProjectWorkspace } from '@/services/project-workspace'

describe('page-design-editor-provider', () => {
  beforeEach(() => {
    resetAppProjectWorkspace()
  })

  it('useAppSingleton resolves to getAppProjectWorkspace', () => {
    const appEditor = getAppProjectWorkspace()
    const resolved = resolvePageDesignEditor(
      { moduleInstanceId: 'orders', useAppSingleton: true },
      new Map(),
    )
    expect(resolved).toBe(appEditor)
  })

  it('isolated mode resolves from headless registry', () => {
    const headless = createHeadlessPageDesignEditor()
    const registry = new Map<string, ProjectWorkspace>([['orders', headless]])

    const resolved = resolvePageDesignEditor(
      { moduleInstanceId: 'orders' },
      registry,
    )
    expect(resolved).toBe(headless)
  })

  it('createPageDesignEditorGetter throws when headless entry is missing', () => {
    const getter = createPageDesignEditorGetter(new Map())
    expect(() => getter({ moduleInstanceId: 'missing' })).toThrow(/not prepared/)
  })
})
