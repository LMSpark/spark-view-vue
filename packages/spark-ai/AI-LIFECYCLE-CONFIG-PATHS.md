# spark-ai AI lifecycle configurable paths

This document is the single reference for configurable paths across the AI lifecycle.

## Layer split

- Core layer: protocol, session transport, FC adapter, orchestration loop, runtime post-actions.
- Business layer: prompts, stills domain, action registry, business catalogs.

## Lifecycle paths (tree)

- core
	- session
		- session.backend.base-url -> core/session/session-backend.ts#SessionBackendImpl -> new SessionBackendImpl(baseUrl, options)
		- session.backend.headers -> core/session/session-backend.ts#SessionBackendImpl -> options.getHeaders
		- session.backend.sse-event-hook -> core/session/session-backend.ts#SessionBackendImpl -> options.onSseEvent
	- tooling
		- tooling.fc.definition-filter -> core/fc-schema.ts#generateToolDefinitions -> filter(types/actions/compactDescriptions)
	- orchestration
		- orchestration.max-rounds -> core/session/session-contracts.ts#OrchestratorConfig.maxRounds -> runStillsLoop(config.maxRounds)
		- orchestration.sliding-window -> core/session/session-contracts.ts#OrchestratorConfig.slidingWindow -> backend.createSession(windowSize)
		- orchestration.monitors -> core/session/session-contracts.ts#OrchestratorConfig.monitors -> SessionMonitor[]
		- orchestration.dispatch-fc -> core/session/session-contracts.ts#OrchestratorConfig.dispatchFc -> custom dispatch function
		- orchestration.sse-hook -> core/session/session-contracts.ts#OrchestratorConfig.onSseEvent -> per-run onSseEvent callback
	- teardown
		- session.destroy-all -> core/session/session-backend.ts#destroyAllSessions -> backend.destroyAllSessions()

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
- AI_LIFECYCLE_CONFIG_TREE
- getLifecycleConfigTree(owner?)
- listLifecycleConfigPaths(owner?, stage?)
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
- When needed for query/filter, use listLifecycleConfigPaths(owner?, stage?) to flatten on demand.
