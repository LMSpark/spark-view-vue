---
description: "Use when editing SPARK backend APIs, spark-ai-server code, page-config flows, tenant/project scoped routing, navigation APIs, generic CRUD, AI chat integration, SSE debug flows, or frontend service-layer API wiring. Covers scoped endpoint preference, API-first change decisions, batch writes, compatibility headers, fail-fast diagnostics, and minimal validation."
name: "SPARK Backend API-First Guidelines"
applyTo: "spark-ai-server/**, src/services/**, packages/spark-app/**"
---

# SPARK Backend API-First Guidelines

Use this instruction for API-related work in `spark-ai-server/**`, `src/services/**`, and `packages/spark-app/**`.

## Decision Order

- First identify whether the request is really a frontend integration issue, an API contract gap, or a dirty-data problem.
- Prefer wiring the frontend to an existing API before adding or expanding backend endpoints.
- If the problem is bad historical data and a direct database repair path already exists, prefer the smallest data fix over polluting app code with compatibility branches.
- Keep changes fail-fast. Do not add silent fallbacks that hide missing tenant context, broken routing, missing page files, or request/response mismatches.

## Endpoint Selection Rules

- Prefer scoped multi-tenant endpoints: `/api/tenants/{tenantId}/projects/{projectId}/...`.
- Use flat compatibility endpoints under `/api/pages-config/**` only when an existing path still depends on them.
- When using compatibility endpoints, require explicit `X-Tenant-Id` and `X-Project-Id` headers. Do not silently fall back to implicit defaults.
- Do not invent a parallel protocol when an existing scoped controller already covers the behavior.

## Pages-Config And Navigation

- Treat `spark-ai-server/data/pages-config/` as the live source of truth, not `public/pages-config/`.
- For page-config save flows, prefer existing scoped APIs and batch-style writes when multiple files are updated together.
- Do not hide page/config lookup failures behind alternate routes or default page fallbacks.
- If route resolution depends on a registered system-page mapping, fail fast on missing mappings instead of reclassifying the request as a config-page lookup.

## Generic CRUD And Query Compatibility

- Reuse existing CRUD endpoints and their parameter conventions before changing controllers.
- When debugging list/query failures, check query parameter compatibility first: pagination keys, sort shape, and base URL composition.
- Do not create one-off backend variants just to accommodate a malformed frontend request if the frontend can be corrected cheaply.

## AI And SSE Debug Flows

- Prefer existing AI chat, page-generation, metadata, and debug endpoints before extending the backend.
- For SSE debugging, completion means the full chain succeeded: request trigger, `/api/events` delivery, frontend execution, and result callback.
- A debug flow is not validated merely because a request event was emitted. Look for the matching result and correlate by `requestId` when available.
- Keep diagnostics explicit: expose which link in the chain failed rather than retrying silently.

## Implementation Defaults

- Frontend API integration belongs in `src/services/**` or the existing app service layer, not in random view components.
- Backend additions should be minimal and contract-driven. Do not expand a focused fix into a new endpoint family.
- Prefer explicit migration or repair actions over startup-time side effects.
- Preserve tenant/project scope boundaries consistently across frontend path builders, headers, controllers, and persistence paths.

## Validation

- Validate the exact endpoint, tenant/project/page/table context, and request payload shape you changed.
- For frontend API wiring changes, usually run `pnpm run typecheck` and a focused Vitest case when coverage exists.
- For backend changes, run `cd spark-ai-server && mvn test` when the touched slice has backend impact.
- For SSE or route-debug work, verify the result callback or observed runtime behavior, not only the trigger step.

## Docs

- `spark-ai-server/README.md` — backend runtime and AI server entry points
- `docs/architecture/PLATFORM_TENANT_ROUTING.md` — tenant/project scope and routing model
- `docs/guides/CONFIG_SYSTEM.md` — page-config runtime boundaries
- `src/services/README.md` — frontend service-layer placement and responsibilities
- `.github/skills/spark-api-first-change/SKILL.md` — detailed API-first workflow for deeper investigations