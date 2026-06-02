import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { generateModuleAbilityMetadata } from '../module-metadata-generator'

const tempRoots: string[] = []

describe('module metadata generator', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers VCM actions from class annotations and public AiModuleResult methods', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiModuleResult<T> {
  readonly value?: T
}

/**
 * Searchable directory returned by the root service.
 *
 * @moduleKind demo-directory
 */
class DemoDirectory {
  /** Search directory entries. */
  public search(_ctx: unknown, args: { keyword?: string }): AiModuleResult<{ results: string[] }> {
    void _ctx
    void args
    return new AiModuleResult()
  }
}

/**
 * Demo root service.
 *
 * @moduleAbility demo.root
 * @moduleKind demo-root
 */
class DemoRootService {
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
  public describe(_ctx: unknown): AiModuleResult<{ status: string }> {
    void _ctx
    return new AiModuleResult()
  }

  /**
   * Submit the current draft.
   */
  public submitDraft(): AiModuleResult<{ submitted: boolean }> {
    return new AiModuleResult()
  }

  /** Open the nested API object. */
  public openDirectory(): AiModuleResult<DemoDirectory> {
    return new AiModuleResult()
  }

  /** Internal diagnostics are not LLM-visible.
   *
   * @internal
   */
  public diagnostics(): AiModuleResult<{ ok: boolean }> {
    return new AiModuleResult()
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
    expect(rootModule?.rootApi.actions.map(action => action.name)).toEqual([
      'describe',
      'submitDraft',
      'openDirectory',
      'helper',
    ])
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
      modules: Array<{ rootApi: { kind: string } }>
    }
    expect(generated.diagnostics.resultApiCount).toBe(1)
    expect(generated.modules[0]?.rootApi.kind).toBe('demo-directory')
    expect(generated.modules[1]?.rootApi.kind).toBe('demo-root')
  })

  it('writes a VCM object element catalog JSON', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
type TreeNode = {
  id: string
  child?: TreeNode
}

/**
 * Child model.
 *
 * @moduleKind query-child
 */
class QueryChild {
  private readonly _secret = 'secret'

  /** Read child title. */
  public title(): string {
    return 'title'
  }
}

/**
 * Root model.
 *
 * @moduleKind query-root
 */
class QueryRoot {
  /** Child model attribute. */
  public readonly child = new QueryChild()

  /** Configure tree metadata. */
  public configure(args: { node: TreeNode; items: TreeNode[] }): string {
    void args
    return 'ok'
  }
}
`, 'utf8')

    const result = generateModuleAbilityMetadata(root, {
      sources: ['sample.ts'],
      outFile: 'out/abilities.json',
      moduleOutFile: 'out/modules.json',
      vcmCatalogOutFile: 'out/vcm-models.json',
      apiRoots: ['QueryRoot'],
    })

    expect(result.vcmCatalogOutFile).toBe(join(root, 'out/vcm-models.json'))
    expect(result.vcmCatalogElementCount).toBe(1)
    const generated = JSON.parse(readFileSync(join(root, 'out/vcm-models.json'), 'utf8')) as {
      props?: Array<{
        name?: string
        schema?: {
          kind?: string
          type?: string
        }
      }>
      events?: unknown[]
      slots?: unknown[]
      exposed?: unknown[]
    }
    expect(generated).toMatchObject({
      props: expect.any(Array),
      events: expect.any(Array),
      slots: expect.any(Array),
      exposed: expect.any(Array),
    })
    const rootProp = generated.props?.find(prop => prop.name === 'QueryRoot')
    expect(rootProp).toMatchObject({
      name: 'QueryRoot',
      schema: {
        kind: 'object',
        type: 'QueryRoot',
      },
    })
    expect(JSON.stringify(generated)).not.toContain('"required":[]')
  })

  it('can diagnose extracted metadata without writing generated files', () => {
    const root = createTempRoot()
    writeFileSync(join(root, 'sample.ts'), `
class AiModuleResult<T> {
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
  public ping(): AiModuleResult<{ ok: boolean }> {
    return new AiModuleResult()
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
class AiModuleResult<T> {
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
  public configure(args: { node: TreeNode; items: TreeNode[]; anything?: unknown }): AiModuleResult<{ ok: boolean }> {
    void args
    return new AiModuleResult()
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
                child: { anyOf: [{ $ref: '#/$defs/TreeNode' }] },
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
class AiModuleResult<T> {
  readonly value?: T
}

/**
 * Child module.
 *
 * @moduleKind pooled-child
 */
class PooledChild {
  /** Return parent again. */
  public parent(): AiModuleResult<PooledParent> {
    return new AiModuleResult()
  }
}

/**
 * Parent module.
 *
 * @moduleKind pooled-parent
 */
class PooledParent {
  /** Return two child handles. */
  public listRefs(): AiModuleResult<{ first: PooledChild; second: PooledChild }> {
    return new AiModuleResult()
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
})

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-module-metadata-'))
  tempRoots.push(root)
  return root
}
