# spark-ai AI lifecycle configurable paths

This document is the single reference for configurable paths across the AI lifecycle.

## Layer split

- Core layer: protocol, session transport, FC adapter, orchestration loop, runtime post-actions.
- Business layer: prompts, stills domain, action registry, business catalogs.

## Lifecycle paths (tree)

- core
	- session
		- session.backend.base-url -> core/runtime/session-backend.ts#createSessionBackend -> createSessionBackend(baseUrl, options)
		- session.backend.headers -> core/runtime/session-backend.ts#createSessionBackend -> options.getHeaders
		- session.backend.sse-event-hook -> core/runtime/session-backend.ts#createSessionBackend -> options.onSseEvent
	- tooling
		- tooling.fc.definition-filter -> core/protocol/function-call-schema.ts#generateToolDefinitions -> filter(types/actions/compactDescriptions)
	- orchestration
		- orchestration.max-rounds -> core/protocol/session-contracts.ts#OrchestratorConfig.maxRounds -> runFunctionLoop(config.maxRounds)
		- orchestration.sliding-window -> core/protocol/session-contracts.ts#OrchestratorConfig.slidingWindow -> backend.createSession(windowSize)
		- orchestration.monitors -> core/protocol/session-contracts.ts#OrchestratorConfig.monitors -> SessionMonitor[]
		- orchestration.sse-hook -> core/protocol/session-contracts.ts#OrchestratorConfig.onSseEvent -> per-run onSseEvent callback
	- teardown
		- session.destroy-all -> core/protocol/session-contracts.ts#SessionBackend.destroyAllSessions -> backend.destroyAllSessions()

- business
	- bootstrap
		- business.stills-domain-registry -> stills/domain.ts#registerDomain -> registerDomain(domainProvider)
		- business.stills-registry -> stills/dispatcher.ts#registerStill -> registerStill(stillDefinition)
	- prompt
		- prompt.mode.registry -> prompts/prompt-builder.ts#registerPromptMode -> registerPromptMode(mode, factory)
		- prompt.page.build-options -> prompts/prompt-builder.ts#buildPageSystemPrompt -> BuildPagePromptOptions(context, metadataProvider)
	- post-action
		- post-action.nav-register -> business/index.ts#createNavRegister -> getNavApiUrl/getHeaders
		- post-action.page-cache -> business/index.ts#createPageCache -> ConfigLoaderRef

## Programmatic access

Use core API to inspect lifecycle paths:

- import from src/core/index.ts
- CORE_LIFECYCLE_CONFIG_TREE
- getLifecycleConfigTree()
- listLifecycleConfigPaths(stage?)
- CORE_SESSION_LIFECYCLE_STAGES
- getCoreLifecycleTree()
- listCoreLifecycleConfigPaths(stage?)

## Core lifecycle-first view

When you only care about core (AI session runtime), follow this order:

1. session
2. tooling
3. orchestration
4. teardown

This order matches the default stage sequence in CORE_SESSION_LIFECYCLE_STAGES.

## Notes

- Lifecycle config source of truth is now tree-first (owner -> stage -> nodes).
- When needed for query/filter, use listLifecycleConfigPaths(stage?) to flatten on demand.
