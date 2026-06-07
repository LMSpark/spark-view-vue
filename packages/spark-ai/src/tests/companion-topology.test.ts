import { describe, expect, it } from 'vitest'

import { AiModule, AiModuleResult, mergeCompanionChildDeclarations } from '../modules'

describe('mergeCompanionChildDeclarations', () => {
  it('merges parentKind into parent children for inspect topology', () => {
    const project = new AiModule({
      kind: 'project',
      name: 'Project',
      description: 'root',
      find: () => AiModuleResult.ok([]),
    })
    const configPage = new AiModule({
      kind: 'config-page',
      name: 'Config Page',
      description: 'guide',
      parentKind: 'project',
      functions: [{
        name: 'editNodeTree',
        description: 'edit node tree',
        paramsSchema: { type: 'object', properties: {} },
      }],
      runner: (_ctx, functionName) => AiModuleResult.failCode(
        'DIRECT_CALL_NOT_SUPPORTED',
        functionName,
        'use module_script',
      ),
    })

    const wired = mergeCompanionChildDeclarations([project, configPage])
    const wiredProject = wired[0]
    const wiredConfigPage = wired[1]
    expect(wiredProject?.children).toEqual(['config-page'])
    expect(wiredConfigPage).toBe(configPage)
  })
})
