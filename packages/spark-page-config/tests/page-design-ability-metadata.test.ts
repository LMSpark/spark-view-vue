import { describe, expect, it } from 'vitest'

import { DataSetCrudTool } from '@spark-view/spark-data'
import moduleMetadataDocument from '../src/registrations/page-design-ability-metadata.generated.json'
import { PageDesignNodeTreeModuleKind } from '../src/registrations/node-tree-tool-catalog'
import { PageDesignDatasetModuleKind } from '../src/registrations/dataset-tool-catalog'

interface GeneratedAbilityMetadataDocument {
  readonly schemaVersion: number
  readonly generatedBy: string
  readonly note: string
  readonly abilities: readonly GeneratedAbilityMetadata[]
}

interface GeneratedAbilityMetadata {
  readonly abilityId: string
  readonly kind?: string
  readonly source: {
    readonly file: string
    readonly className: string
  }
  readonly attackSurfaces: readonly { readonly id: string }[]
  readonly mutations: readonly {
    readonly resource: string
    readonly mode: string
    readonly description: string
  }[]
  readonly actions: readonly {
    readonly name: string
    readonly methodName: string
  }[]
}

const PAGE_DESIGN_ABILITY_METADATA_DOCUMENT =
  moduleMetadataDocument as GeneratedAbilityMetadataDocument

function requireAbility(
  abilities: readonly GeneratedAbilityMetadata[],
  abilityId: string,
): GeneratedAbilityMetadata {
  const ability = abilities.find(item => item.abilityId === abilityId)
  if (ability === undefined) {
    throw new Error(`missing generated ability metadata: ${abilityId}`)
  }
  return ability
}

function actionNames(actions: readonly { readonly name: string }[]): string[] {
  return actions.map(action => action.name)
}

function sortedActionNames(actions: readonly { readonly name: string }[]): string[] {
  return actionNames(actions).sort()
}

function actionMethodNames(actions: readonly { readonly methodName: string }[]): string[] {
  return actions.map(action => action.methodName)
}

function abilityIds(abilities: readonly { readonly abilityId: string }[]): string[] {
  return abilities.map(ability => ability.abilityId)
}

describe('page-design ability metadata generation', () => {
  it('generates VCM-like metadata from domain ability classes', () => {
    const document = PAGE_DESIGN_ABILITY_METADATA_DOCUMENT
    expect(document.schemaVersion).toBe(1)
    expect(document.generatedBy).toBe('packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts')
    expect(document.note).toContain('pnpm run generate:module-metadata')
    expect(abilityIds(document.abilities)).toEqual([
      'pageDesign.nodeTree',
      'pageDesign.dataset',
    ])

    const nodeTree = requireAbility(document.abilities, 'pageDesign.nodeTree')
    expect(nodeTree.kind).toBe('node-tree')
    expect(nodeTree.source).toMatchObject({
      file: 'packages/spark-page-config/src/page/model/spark-node-tree.ts',
      className: 'SparkNodeTree',
    })
    expect(nodeTree.attackSurfaces.map(surface => surface.id)).toEqual([
      'rule-tree-structure',
      'handler-reference',
    ])
    expect(nodeTree.mutations[0]).toMatchObject({
      resource: 'rule.json',
      mode: 'read-write',
      description: 'SparkNodeTree 公开写方法直接修改当前页面 rule.json live model。',
    })
    expect(sortedActionNames(nodeTree.actions)).toEqual(
      sortedActionNames(new PageDesignNodeTreeModuleKind({ service: undefined as any, contextFactory: undefined as any }).actions),
    )

    const dataset = requireAbility(document.abilities, 'pageDesign.dataset')
    expect(dataset.kind).toBe('dataset')
    expect(dataset.source).toMatchObject({
      file: 'packages/spark-data/src/dataset-crud-tool.ts',
      className: 'DataSetCrudTool',
    })
    expect(dataset.attackSurfaces.map(surface => surface.id)).toEqual([
      'dataset-schema',
      'dataset-row-data',
      'remote-crud-config',
    ])
    expect(dataset.mutations[0]).toMatchObject({
      resource: 'pagedata.json',
      mode: 'read-write',
      description: 'DataSetCrudTool 公开写方法直接修改当前页面 pagedata.json live model。',
    })
    expect(sortedActionNames(dataset.actions)).toEqual(
      sortedActionNames(new PageDesignDatasetModuleKind({ service: undefined as any, contextFactory: undefined as any }).actions),
    )
    expect(actionMethodNames(dataset.actions).every(methodName => methodName in DataSetCrudTool.prototype)).toBe(true)
  })
})
