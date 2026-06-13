import { describe, expect, it } from 'vitest'

import { visitDtsTypeMeta, canRenderMethodSignatureFromTypeTree, collectDtsTypeReferenceNames } from '../class-model/dts-type-meta-ops'
import { readDtsFileProjectionDocument } from '../class-model/read-dts-class-model-bundle-json'
import { renderDtsTypeMeta, renderMethodParameter, renderMethodSignatureFromMeta } from '../class-model/signature-renderer'
import type { DtsTypeMeta, MethodMeta } from '../class-model/types'

const removedReturnTypeField = ['return', 'Type'].join('')

describe('DtsTypeMeta TypeDoc extensions (PR-1)', () => {
  it('parses optional, reflection, tuple, and rest discriminators', () => {
    const raw: unknown = {
      schemaVersion: 1,
      sourcePath: 'class-model-emit/demo.d.ts',
      module: {
        name: 'demo',
        sourcePath: 'class-model-emit/demo.d.ts',
        sourceFile: 'packages/demo/src/demo.ts',
        modulePath: 'demo',
        jsdoc: '',
        jsdocSource: 'inferred',
        symbols: ['Demo'],
      },
      symbols: ['Demo'],
      models: {
        Demo: {
          kind: 'Demo',
          className: 'Demo',
          jsdoc: '',
          attributes: [],
          methods: [{
            name: 'edit',
            jsdoc: '',
            signatureText: 'edit(run: (tool: Tool) => void): Promise<void>',
            parameterStyle: 'positional',
            parameters: [{
              name: 'run',
              type: {
                type: 'reflection',
                declaration: {
                  signatures: [{
                    parameters: [{
                      name: 'tool',
                      type: {
                        type: 'reference',
                        name: 'Tool',
                        sourcePath: 'class-model-emit/tool.d.ts',
                      },
                    }],
                    type: { type: 'intrinsic', name: 'void' },
                  }],
                },
              },
            }],
            type: {
              type: 'reference',
              name: 'Promise',
              typeArguments: [{ type: 'intrinsic', name: 'void' }],
            },
          }, {
            name: 'get',
            jsdoc: '',
            signatureText: 'get(): Tool | undefined',
            parameterStyle: 'positional',
            parameters: [],
            type: {
              type: 'optional',
              elementType: { type: 'reference', name: 'Tool' },
            },
          }],
        },
      },
    }

    const doc = readDtsFileProjectionDocument(raw)
    const edit = doc.models['Demo']?.methods.find(method => method.name === 'edit')
    const get = doc.models['Demo']?.methods.find(method => method.name === 'get')

    expect(edit?.parameters?.[0]?.type.type).toBe('reflection')
    expect(edit?.type?.type).toBe('reference')
    expect(get?.type?.type).toBe('optional')
  })

  it('renders optional, reflection, tuple, and rest types', () => {
    const optional: DtsTypeMeta = {
      type: 'optional',
      elementType: { type: 'reference', name: 'AiAgentRegistration' },
    }
    const reflection: DtsTypeMeta = {
      type: 'reflection',
      declaration: {
        signatures: [{
          parameters: [{
            name: 'tool',
            type: { type: 'reference', name: 'DataSetCrudTool' },
          }],
          type: {
            type: 'union',
            types: [
              { type: 'intrinsic', name: 'void' },
              { type: 'reference', name: 'Promise', typeArguments: [{ type: 'intrinsic', name: 'void' }] },
            ],
          },
        }],
      },
    }
    const tuple: DtsTypeMeta = { type: 'tuple', elements: [{ type: 'intrinsic', name: 'string' }, { type: 'intrinsic', name: 'number' }] }
    const rest: DtsTypeMeta = { type: 'rest', elementType: { type: 'array', elementType: { type: 'intrinsic', name: 'string' } } }

    expect(renderDtsTypeMeta(optional)).toBe('AiAgentRegistration | undefined')
    expect(renderDtsTypeMeta(reflection)).toBe('(tool: DataSetCrudTool) => void | Promise<void>')
    expect(renderDtsTypeMeta(tuple)).toBe('[string, number]')
    expect(renderDtsTypeMeta(rest)).toBe('...string[]')
    expect(renderMethodParameter({
      name: 'moduleId',
      type: { type: 'intrinsic', name: 'string' },
      flags: { isOptional: true },
    })).toBe('moduleId?: string')
  })

  it('visits nested references inside reflection signatures', () => {
    const typeMeta: DtsTypeMeta = {
      type: 'reflection',
      declaration: {
        signatures: [{
          parameters: [{
            name: 'tool',
            type: { type: 'reference', name: 'DataSetCrudTool' },
          }],
          type: { type: 'intrinsic', name: 'void' },
        }],
      },
    }
    const references: string[] = []
    visitDtsTypeMeta(typeMeta, (node) => {
      if (node.type === 'reference') references.push(node.name)
    })
    expect(references).toEqual(['DataSetCrudTool'])
  })

  it('prefers type tree over signatureText when rendering method signatures (PR-3)', () => {
    const method: MethodMeta = {
      name: 'get',
      jsdoc: '',
      signatureText: 'get(moduleId: string): AiAgentRegistration | undefined',
      parameterStyle: 'positional',
      parameters: [{
        name: 'moduleId',
        type: { type: 'intrinsic', name: 'string' },
      }],
      type: {
        type: 'optional',
        elementType: { type: 'reference', name: 'AiAgentRegistration' },
      },
    }
    expect(canRenderMethodSignatureFromTypeTree(method)).toBe(true)
    expect(renderMethodSignatureFromMeta(method))
      .toBe('get(moduleId: string): AiAgentRegistration | undefined')
  })

  it('collects reference names from reflection callback parameters', () => {
    const typeMeta: DtsTypeMeta = {
      type: 'reflection',
      declaration: {
        signatures: [{
          parameters: [{
            name: 'tool',
            type: { type: 'reference', name: 'DataSetCrudTool' },
          }],
          type: { type: 'intrinsic', name: 'void' },
        }],
      },
    }
    expect(collectDtsTypeReferenceNames(typeMeta)).toEqual(['DataSetCrudTool'])
  })

  it('derives signatureText on read when bundle omits it (PR-5)', () => {
    const raw: unknown = {
      schemaVersion: 1,
      sourcePath: 'class-model-emit/demo.d.ts',
      module: {
        name: 'demo',
        sourcePath: 'class-model-emit/demo.d.ts',
        sourceFile: 'packages/demo/src/demo.ts',
        modulePath: 'demo',
        jsdoc: '',
        jsdocSource: 'inferred',
        symbols: ['Demo'],
      },
      symbols: ['Demo'],
      models: {
        Demo: {
          kind: 'Demo',
          className: 'Demo',
          jsdoc: '',
          attributes: [],
          methods: [{
            name: 'get',
            jsdoc: '',
            parameterStyle: 'positional',
            parameters: [{
              name: 'moduleId',
              type: { type: 'intrinsic', name: 'string' },
            }],
            type: {
              type: 'optional',
              elementType: { type: 'reference', name: 'Tool' },
            },
          }],
        },
      },
    }

    const doc = readDtsFileProjectionDocument(raw)
    const get = doc.models['Demo']?.methods.find(method => method.name === 'get')
    expect(get?.signatureText).toBe('get(moduleId: string): Tool | undefined')
    expect(get).not.toHaveProperty(removedReturnTypeField)
  })
})
