import { describe, expect, it } from 'vitest'

import {
  collectNestedApiRecords,
  walkAiApiMetadataGraph,
  type AiApiObjectMetadata,
} from '../vcm-native'

const CHILD_VIA_ACTION: AiApiObjectMetadata = {
  kind: 'ChildModel',
  className: 'ChildModel',
  name: 'ChildModel',
  description: 'Child model API',
  actions: [{
    name: 'mutate',
    methodName: 'mutate',
    description: 'Mutate child',
    paramsSchema: { type: 'object', properties: {}, required: [] },
  }],
}

const CHILD_VIA_ATTR: AiApiObjectMetadata = {
  kind: 'LeafModel',
  className: 'LeafModel',
  name: 'LeafModel',
  description: 'Leaf model API',
  actions: [{
    name: 'touch',
    methodName: 'touch',
    description: 'Touch leaf',
    paramsSchema: { type: 'object', properties: {}, required: [] },
  }],
}

const ROOT: AiApiObjectMetadata = {
  kind: 'RootModel',
  className: 'RootModel',
  name: 'RootModel',
  description: 'Root model API',
  attributes: [{
    name: 'leaf',
    description: 'Leaf handle',
    schema: { type: 'object' },
    readable: true,
    writable: false,
    api: CHILD_VIA_ATTR,
  }],
  actions: [{
    name: 'openChild',
    methodName: 'openChild',
    description: 'Open child',
    paramsSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    resultApis: [{ resultPath: [], api: CHILD_VIA_ACTION }],
  }],
}

describe('metadata-graph', () => {
  it('walks model -> attribute|action -> child submodule edges', () => {
    const nodes = walkAiApiMetadataGraph(ROOT)
    const root = nodes[0]
    expect(root?.api.kind).toBe('RootModel')
    expect(root?.edges).toHaveLength(2)
    expect(root?.edges.some(edge => edge.via === 'attribute' && edge.viaName === 'leaf' && edge.child.kind === 'LeafModel')).toBe(true)
    expect(root?.edges.some(edge => edge.via === 'action' && edge.viaName === 'openChild' && edge.child.kind === 'ChildModel')).toBe(true)
  })

  it('collectNestedApiRecords dedupes by className key and keeps first parent', () => {
    const records = collectNestedApiRecords(ROOT)
    expect(records.map(record => record.api.kind).sort()).toEqual(['ChildModel', 'LeafModel'])
    const child = records.find(record => record.api.kind === 'ChildModel')
    expect(child?.parentKind).toBe('RootModel')
    expect(child?.via).toBe('action')
    expect(child?.viaName).toBe('openChild')
  })
})
