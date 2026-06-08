import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  compareModuleMetadataForBuildConsistency,
  generateModuleAbilityMetadata,
} from '../module-metadata-generator'

const tempRoots: string[] = []

describe('module metadata generator', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers VCM actions from class annotations and public AiAgentToolResult methods', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiAgentToolResult<T> {
  readonly value?: T
}

/**
 * Searchable directory returned by the root service.
 *
 * @moduleKind demo-directory
 */
class DemoDirectory {
  /** Search directory entries. */
  public search(_ctx: unknown, args: { keyword?: string }): AiAgentToolResult<{ results: string[] }> {
    void _ctx
    void args
    return new AiAgentToolResult()
  }
}

/**
 * Demo root service.
 *
 * @moduleAbility demo.root
 * @moduleKind demo-root
 */
class DemoRootService {
  /** Demo service label. */
  public readonly label = 'demo'

  // ===== constructor =====

  /**
   * Create demo root service.
   *
   * @param name Demo service name.
   * @param options Optional creation flags.
   */
  constructor(name: string, options?: { enabled: boolean }) {
    void name
    void options
  }

  /** Describe current state. */
  public describe(_ctx: unknown): AiAgentToolResult<{ status: string }> {
    void _ctx
    return new AiAgentToolResult()
  }

  /**
   * Submit the current draft.
   */
  public submitDraft(): AiAgentToolResult<{ submitted: boolean }> {
    return new AiAgentToolResult()
  }

  /** Open the nested API object. */
  public openDirectory(): AiAgentToolResult<DemoDirectory> {
    return new AiAgentToolResult()
  }

  /** Internal diagnostics are not LLM-visible.
   *
   * @internal
   */
  public diagnostics(): AiAgentToolResult<{ ok: boolean }> {
    return new AiAgentToolResult()
  }

  /** Public documented helpers are action-like under class-only VCM extraction. */
  public helper(): string {
    return 'helper'
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      extractResults: true,
    })

    expect(result.abilities[0]?.actions.map(action => action.name)).toEqual([
      'describe',
      'submitDraft',
      'openDirectory',
      'helper',
    ])
    const rootModule = result.moduleMetadata.find(module => module.rootApi.kind === 'demo-root')
    expect(rootModule?.rootApi.jsdoc).toMatchObject({
      summary: 'Demo root service.',
      tags: [
        { name: 'moduleAbility', text: 'demo.root' },
        { name: 'moduleKind', text: 'demo-root' },
      ],
    })
    expect(rootModule?.rootApi.provenance).toMatchObject({
      file: 'sample.ts',
      className: 'DemoRootService',
    })
    expect(rootModule?.rootApi.jsdoc?.raw).toContain('Demo root service.')
    expect(rootModule?.rootApi.attributes?.[0]?.jsdoc).toMatchObject({
      summary: 'Demo service label.',
    })
    expect(rootModule?.rootApi.attributes?.[0]?.jsdoc?.raw).toContain('Demo service label.')
    expect(result.abilities[0]?.constructorSignature).toMatchObject({
      description: 'Create demo root service.',
      params: [
        { name: 'name', type: 'string', optional: false, description: 'Demo service name.' },
        { name: 'options', type: '{ enabled: boolean }', optional: true, description: 'Optional creation flags.' },
      ],
    })
    expect(rootModule?.rootApi.constructorSignature).toMatchObject({
      description: 'Create demo root service.',
      paramsSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          options: expect.any(Object),
        },
        required: ['name'],
      },
    })
    expect(rootModule?.rootApi.constructorSignature?.jsdoc).toMatchObject({
      summary: 'Create demo root service.',
      tags: [
        { name: 'param', text: 'Demo service name.' },
        { name: 'param', text: 'Optional creation flags.' },
      ],
    })
    expect(rootModule?.rootApi.constructorSignature?.jsdoc?.raw).toContain('Create demo root service.')
    expect(rootModule?.rootApi.constructorSignature?.provenance).toMatchObject({
      file: 'sample.ts',
      className: 'DemoRootService',
      memberName: 'constructor',
    })
    expect(rootModule?.rootApi.actions.map(action => action.name)).toEqual([
      'describe',
      'submitDraft',
      'openDirectory',
      'helper',
    ])
    expect(rootModule?.rootApi.actions[0]?.jsdoc).toMatchObject({
      summary: 'Describe current state.',
    })
    expect(rootModule?.rootApi.actions[0]?.jsdoc?.raw).toContain('Describe current state.')
    expect(rootModule?.rootApi.actions[0]?.provenance).toMatchObject({
      file: 'sample.ts',
      className: 'DemoRootService',
      memberName: 'describe',
    })
    expect(rootModule?.rootApi.actions[2]?.resultApis?.[0]?.api.kind).toBe('demo-directory')
    expect(result.diagnostics).toMatchObject({
      abilityCount: 1,
      moduleCount: 2,
      actionCount: 5,
      resultApiCount: 1,
      referencedApiKinds: ['demo-directory'],
    })
    expect(result.diagnostics.modules.find(module => module.kind === 'demo-root')).toMatchObject({
      actionCount: 4,
      directResultApiKinds: ['demo-directory'],
      resultApiCount: 1,
    })

    const generated = JSON.parse(readFileSync(join(root, 'out/modules.json'), 'utf8')) as {
      diagnostics: { resultApiCount: number }
      modules: Array<{
        rootApi: {
          kind: string
          jsdoc?: { raw?: string }
          provenance?: { file?: string; className?: string }
          constructorSignature?: { jsdoc?: { raw?: string } }
          attributes?: Array<{ jsdoc?: { raw?: string } }>
          actions: Array<{ jsdoc?: { raw?: string } }>
        }
      }>
    }
    expect(generated.diagnostics.resultApiCount).toBe(1)
    expect(generated.modules[0]?.rootApi.kind).toBe('demo-directory')
    expect(generated.modules[1]?.rootApi.kind).toBe('demo-root')
    expect(generated.modules[1]?.rootApi.jsdoc?.raw).toContain('Demo root service.')
    expect(generated.modules[1]?.rootApi.provenance).toMatchObject({
      file: 'sample.ts',
      className: 'DemoRootService',
    })
    expect(generated.modules[1]?.rootApi.constructorSignature?.jsdoc?.raw).toContain('Create demo root service.')
    expect(generated.modules[1]?.rootApi.attributes?.[0]?.jsdoc?.raw).toContain('Demo service label.')
    expect(generated.modules[1]?.rootApi.actions[0]?.jsdoc?.raw).toContain('Describe current state.')
  })

  it('prefers source class JSDoc over dist declaration files for reflected child APIs', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'dist/types'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'dist/types/child.d.ts'), `
/**
 * Old declaration child API.
 *
 * @moduleKind child-api
 */
export declare class ChildApi {
  /** Old declaration constructor. */
  constructor()

  /** Old declaration search. */
  search(): string
}
`, 'utf8')
    writeFileSync(join(root, 'src/child.ts'), `
/**
 * Source child API.
 *
 * @moduleKind child-api
 */
export class ChildApi {
  /**
   * Source child constructor.
   */
  constructor() {}

  /**
   * Source child search.
   */
  public search(): string {
    return 'ok'
  }
}
`, 'utf8')
    writeFileSync(join(root, 'root.ts'), `
import type { ChildApi } from './dist/types/child'

class AiAgentToolResult<T> {
  readonly value?: T
}

/**
 * Root API.
 *
 * @moduleKind root-api
 */
class RootApi {
  /** Open child API. */
  public openChild(): AiAgentToolResult<ChildApi> {
    return new AiAgentToolResult()
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['root.ts', 'src/child.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      apiRoots: ['RootApi'],
      extractResults: true,
      writeFiles: false,
    })

    const childApi = result.moduleMetadata[0]?.rootApi.actions[0]?.resultApis?.[0]?.api
    expect(childApi).toMatchObject({
      kind: 'child-api',
      provenance: {
        file: 'src/child.ts',
        className: 'ChildApi',
        typeEntryFile: 'dist/types/child.d.ts',
      },
      jsdoc: {
        summary: 'Source child API.',
      },
      constructorSignature: {
        provenance: {
          file: 'src/child.ts',
          className: 'ChildApi',
          memberName: 'constructor',
          typeEntryFile: 'dist/types/child.d.ts',
        },
        jsdoc: {
          summary: 'Source child constructor.',
        },
      },
      actions: [
        {
          name: 'search',
          provenance: {
            file: 'src/child.ts',
            className: 'ChildApi',
            memberName: 'search',
            typeEntryFile: 'dist/types/child.d.ts',
          },
          jsdoc: {
            summary: 'Source child search.',
          },
        },
      ],
    })
    expect(JSON.stringify(childApi)).not.toContain('Old declaration')

    const typeEntryResult = generateModuleAbilityMetadata(root, {
      sources: ['root.ts', 'src/child.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      apiRoots: ['RootApi'],
      extractResults: true,
      reflectionMode: 'type-entry',
      writeFiles: false,
    })
    expect(compareModuleMetadataForBuildConsistency(result.moduleMetadata, typeEntryResult.moduleMetadata)).toContainEqual({
      code: 'MODULE_METADATA_BUILD_CONSISTENCY_MISMATCH',
      path: 'child-api.jsdoc.summary',
      message: expect.stringContaining('Old declaration child API.'),
    })
  })

  it('uses tsconfig.catalog paths to reflect cross-package source declarations without build output', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'tsconfig.catalog.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        baseUrl: '.',
        paths: {
          '@demo/child': ['src/child.ts'],
        },
      },
    }), 'utf8')
    writeFileSync(join(root, 'src/child.ts'), `
/**
 * Source-only child API.
 *
 * @moduleKind child-api
 */
export class ChildApi {
  /**
   * Source-only child constructor.
   */
  constructor() {}

  /** Source-only search. */
  public search(): string {
    return 'ok'
  }
}
`, 'utf8')
    writeFileSync(join(root, 'root.ts'), `
import type { ChildApi } from '@demo/child'

class AiAgentToolResult<T> {
  readonly value?: T
}

/**
 * Root API.
 *
 * @moduleKind root-api
 */
class RootApi {
  /** Open child API. */
  public openChild(): AiAgentToolResult<ChildApi> {
    return new AiAgentToolResult()
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['root.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      apiRoots: ['RootApi'],
      extractResults: true,
      writeFiles: false,
    })

    const childApi = result.moduleMetadata[0]?.rootApi.actions[0]?.resultApis?.[0]?.api
    expect(childApi).toMatchObject({
      kind: 'child-api',
      provenance: {
        file: 'src/child.ts',
        className: 'ChildApi',
      },
      jsdoc: {
        summary: 'Source-only child API.',
      },
      constructorSignature: {
        jsdoc: {
          summary: 'Source-only child constructor.',
        },
      },
    })
  })

  it('discovers resultApis from script-only mutator callback parameter', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
/**
 * @moduleKind demo-tree
 */
class DemoTree {
  /** Add node. */
  public addNode(): void {}
}

/**
 * @moduleKind demo-config-page
 * @moduleActionMode explicit
 */
class DemoConfigPage {
  /**
   * Edit node tree in vcm_script.
   *
   * @moduleMutation rule.json write Edit node tree in vcm_script.
   * @vcmScriptOnly
   */
  public async editNodeTree(run: (tree: DemoTree) => void | Promise<void>): Promise<void> {
    await run(new DemoTree())
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/modules.json',
      moduleOutFile: 'out/modules.json',
      extractResults: true,
    })

    const configPage = result.moduleMetadata.find(module => module.rootApi.kind === 'demo-config-page')
    const editNodeTree = configPage?.rootApi.actions.find(action => action.name === 'editNodeTree')
    expect(editNodeTree?.resultApis?.[0]?.api.kind).toBe('demo-tree')
    expect(editNodeTree?.usageRules).toContain('Must use vcm_script; direct function call is not supported.')
  })

  it('writes a human-facing JSDoc todo log JSON', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
/**
 * Root model.
 *
 * @moduleKind query-root
 */
class QueryRoot {
  /** Configure tree metadata. */
  public configure(args: { nodeId: string }): string {
    void args
    return 'ok'
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      jsdocTodoLogOutFile: 'out/jsdoc-todo.json',
      apiRoots: ['QueryRoot'],
    })

    expect(result.jsdocTodoLogOutFile).toBe(join(root, 'out/jsdoc-todo.json'))
    const generated = JSON.parse(readFileSync(join(root, 'out/jsdoc-todo.json'), 'utf8')) as {
      summary?: {
        jsdocTodoCount?: number
        schemaDescriptionTodoCount?: number
      }
      jsdocTodoLog?: Array<{
        memberName?: string
        reasons?: string[]
      }>
    }
    expect(generated.summary?.jsdocTodoCount).toBeGreaterThan(0)
    expect(generated.jsdocTodoLog?.some(entry =>
      entry.memberName === 'configure'
      && entry.reasons?.some(reason => reason.includes('missing @param')),
    )).toBe(true)
  })

  it('can diagnose extracted metadata without writing generated files', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiAgentToolResult<T> {
  readonly value?: T
}

/**
 * Demo diagnostics service.
 *
 * @moduleAbility demo.diagnostics
 * @moduleKind demo-diagnostics
 */
class DemoDiagnosticsService {
  /** Ping current state. */
  public ping(): AiAgentToolResult<{ ok: boolean }> {
    return new AiAgentToolResult()
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      writeFiles: false,
    })

    expect(result.diagnostics).toMatchObject({
      abilityCount: 1,
      moduleCount: 1,
      actionCount: 1,
    })
    expect(existsSync(join(root, 'out/abilities.json'))).toBe(false)
    expect(existsSync(join(root, 'out/modules.json'))).toBe(false)
  })

  it('uses @vcmIgnore to opt public documented methods out of extraction', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
/**
 * Demo ignore service.
 *
 * @moduleKind demo-ignore
 */
class DemoIgnoreService {
  /** Visible action. */
  public visible(): string {
    return 'visible'
  }

  /**
   * Local helper kept public for tests but hidden from VCM.
   *
   * @vcmIgnore
   */
  public helper(): string {
    return 'helper'
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      writeFiles: false,
    })

    expect(result.moduleMetadata[0]?.rootApi.actions.map(action => action.name)).toEqual(['visible'])
  })

  it('pools complex parameter schemas into $defs refs', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiAgentToolResult<T> {
  readonly value?: T
}

type TreeNode = {
  id: string
  child?: TreeNode
}

/**
 * Schema pooling service.
 *
 * @moduleKind schema-pooling
 */
class SchemaPoolingService {
  /** Configure recursive node metadata. */
  public configure(args: { node: TreeNode; items: TreeNode[]; anything?: unknown }): AiAgentToolResult<{ ok: boolean }> {
    void args
    return new AiAgentToolResult()
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      writeFiles: false,
    })

    const action = result.moduleMetadata[0]?.rootApi.actions[0]
    const paramsSchema = action?.paramsSchema
    expect(paramsSchema).toMatchObject({
      type: 'object',
      properties: {
        args: {
          type: 'object',
          properties: {
            node: { $ref: '#/$defs/TreeNode' },
            items: { type: 'array', items: { $ref: '#/$defs/TreeNode' } },
            anything: true,
          },
          $defs: {
            TreeNode: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                child: { $ref: '#/$defs/TreeNode' },
              },
            },
          },
        },
      },
    })
    expect(result.diagnostics.emptySchemaNodeCount).toBe(0)
  })

  it('dedupes nested API objects while preserving sibling result paths', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiAgentToolResult<T> {
  readonly value?: T
}

/**
 * Child module.
 *
 * @moduleKind pooled-child
 */
class PooledChild {
  /** Return parent again. */
  public parent(): AiAgentToolResult<PooledParent> {
    return new AiAgentToolResult()
  }
}

/**
 * Parent module.
 *
 * @moduleKind pooled-parent
 */
class PooledParent {
  /** Return two child handles. */
  public listRefs(): AiAgentToolResult<{ first: PooledChild; second: PooledChild }> {
    return new AiAgentToolResult()
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      extractResults: true,
      writeFiles: false,
    })

    const parent = result.moduleMetadata.find(module => module.rootApi.kind === 'pooled-parent')?.rootApi
    const refs = parent?.actions[0]?.resultApis ?? []
    expect(refs.map(ref => ref.resultPath.join('.'))).toEqual(['first', 'second'])
    expect(refs.map(ref => ref.api.kind)).toEqual(['pooled-child', 'pooled-child'])
    expect(refs[0]?.api).toBe(refs[1]?.api)
    expect(refs[0]?.api.actions[0]?.resultApis).toEqual([])
  })

  it('extracts usageRule, requiredBeforeCall and failureMode tags from action JSDoc', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiAgentToolResult<T> {
  readonly value?: T
}

/**
 * Demo root service.
 *
 * @moduleKind demo-root
 */
class DemoRootService {
  /**
   * Submit the current draft.
   *
   * @usageRule 必须先确认草稿内容
   * @requiredBeforeCall 先 readPlanningProjection 确认 pageId
   * @failureMode DRAFT_NOT_FOUND 草稿不存在 => 先调用 setDraftFields 创建草稿
   */
  public submitDraft(): AiAgentToolResult<{ submitted: boolean }> {
    return new AiAgentToolResult()
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      extractResults: true,
      writeFiles: false,
    })

    const submitDraft = result.moduleMetadata
      .find(module => module.rootApi.kind === 'demo-root')
      ?.rootApi.actions.find(action => action.name === 'submitDraft')

    expect(submitDraft).toMatchObject({
      usageRules: ['必须先确认草稿内容'],
      requiredBeforeCall: ['先 readPlanningProjection 确认 pageId'],
      failureModes: [{
        code: 'DRAFT_NOT_FOUND',
        when: '草稿不存在',
        fix: '先调用 setDraftFields 创建草稿',
      }],
    })
  })
})

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-module-metadata-'))
  tempRoots.push(root)
  return root
}
