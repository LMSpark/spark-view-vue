import type { AiScenarioContext, AiScenarioTool } from '../contracts/scenario-types'
import type { PageModelHost } from './contracts'
import { legacyParamsToJsonSchema } from './schema-adapter'
import type { PageModelKnowledgeRegistration } from './registration'
import type { PageModelFunctionDefinition, PageModelToolFamily } from './tool-contracts'
import { isPageModelToolFailure } from './tool-contracts'

export interface PageModelScenarioToolAdapterOptions {
  resolveHost: (args: unknown, ctx: AiScenarioContext) => PageModelHost | Promise<PageModelHost>
  persistHostState: (host: PageModelHost) => Promise<void>
}

export function createScenarioToolsFromPageModelTools(
  families: readonly PageModelToolFamily[],
  options: PageModelScenarioToolAdapterOptions,
): readonly AiScenarioTool[] {
  return families.flatMap((family) => family.functions.map((definition) => createScenarioTool(family, definition, options)))
}

export function createScenarioToolsFromPageModelRegistration(
  registration: PageModelKnowledgeRegistration,
  options: PageModelScenarioToolAdapterOptions,
): readonly AiScenarioTool[] {
  return createScenarioToolsFromPageModelTools(registration.toolFamilies, options)
}

function createScenarioTool(
  family: PageModelToolFamily,
  definition: PageModelFunctionDefinition,
  options: PageModelScenarioToolAdapterOptions,
): AiScenarioTool {
  if (!definition.action.startsWith(`${family.name}.`)) {
    throw new Error(`PageModel function ${definition.action} does not belong to tool family ${family.name}.`)
  }

  return {
    name: definition.action,
    description: definition.description,
    parameters: legacyParamsToJsonSchema(definition.paramsSchema),
    registration: {
      category: family.name,
      tags: ['page-model', family.name],
      ...(definition.example !== undefined ? { example: definition.example } : {}),
      rules: [...(family.rules ?? []), ...(definition.usageRules ?? [])],
      ...(definition.failureModes !== undefined ? { failureCodes: definition.failureModes.map((mode) => mode.code) } : {}),
      ...definition.registration,
      execution: { host: 'frontend', kind: 'tool' },
    },
    execute: async (args, ctx) => {
      const host = await options.resolveHost(args, ctx)
      const result = await definition.execute({ host, args, scenarioContext: ctx })
      const shouldPersist = definition.persistAfterExecute === 'always'
        || (definition.persistAfterExecute === 'success' && !isPageModelToolFailure(result))
      if (shouldPersist) {
        await options.persistHostState(host)
      }
      return result
    },
  }
}
