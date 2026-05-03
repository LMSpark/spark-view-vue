import type { AiScenarioDefinition } from '../scenario-engine'
import { createPageDesignBusinessScenario } from '../scenario-engine/builtins/page-design-scenario'
import type { CreatePageDesignBusinessScenarioOptions } from '../scenario-engine/builtins/page-design-scenario'
import type { PageModelSessionHostRuntime } from './page-model-session-host'

export {
  PAGE_DESIGN_BUSINESS_SCENARIO_ID,
  createPageDesignBusinessScenario,
  registerPageDesignBusinessScenario,
  isPageDesignBusinessWriteTool,
  type CreatePageDesignBusinessScenarioOptions,
  type PageDesignScenarioStillEvent,
} from '../scenario-engine/builtins/page-design-scenario'

export interface CreatePageDesignBusinessScenarioFromSessionHostOptions
  extends Omit<CreatePageDesignBusinessScenarioOptions, 'resolveSession'> {
  sessionHost: PageModelSessionHostRuntime
}

export function createPageDesignBusinessScenarioFromSessionHost(
  options: CreatePageDesignBusinessScenarioFromSessionHostOptions
): AiScenarioDefinition {
  return createPageDesignBusinessScenario({
    ...options,
    resolveSession: () => options.sessionHost.ensureSession().session,
  })
}
