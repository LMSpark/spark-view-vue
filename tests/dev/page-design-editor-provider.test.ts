import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectEditor } from '@spark-appworks/spark-project-model/project'
import { resetAppProjectEditor } from '@/services/project-editor-host'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
  resolvePageDesignEditor,
} from '@/services/page-design-editor-provider'
import { getAppProjectEditor } from '@/services/project-editor-host'

describe('page-design-editor-provider', () => {
  beforeEach(() => {
    resetAppProjectEditor()
  })

  it('useAppSingleton resolves to getAppProjectEditor', () => {
    const appEditor = getAppProjectEditor()
    const resolved = resolvePageDesignEditor(
      { moduleInstanceId: 'orders', useAppSingleton: true },
      new Map(),
    )
    expect(resolved).toBe(appEditor)
  })

  it('isolated mode resolves from headless registry', () => {
    const headless = createHeadlessPageDesignEditor()
    const registry = new Map<string, ProjectEditor>([['orders', headless]])

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
