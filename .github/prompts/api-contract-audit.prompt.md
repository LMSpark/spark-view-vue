---
description: "Audit a SPARK API contract before changing frontend or backend code. Use when investigating pages-config, navigation, scoped routing, generic CRUD, AI chat, or SSE debug flows."
name: "API Contract Audit"
argument-hint: "描述接口问题、tenant/project/page/table、期望行为或失败现象"
agent: "agent"
---

Use [backend-api-first.instructions.md](../instructions/backend-api-first.instructions.md) and [tests-and-validation.instructions.md](../instructions/tests-and-validation.instructions.md).

Audit the existing SPARK API contract for the request below before deciding whether any code should change.

Workflow:

1. Inventory the existing endpoints, frontend service-layer callers, route/path builders, required headers, request payloads, query parameters, and nearby tests/docs.
2. Decide which of these is true:
   - frontend integration bug
   - backend contract gap
   - dirty-data problem better repaired outside application code
3. Prefer scoped endpoints under `/api/tenants/{tenantId}/projects/{projectId}/...`.
4. If compatibility endpoints are involved, verify `X-Tenant-Id` and `X-Project-Id` explicitly.
5. For pages-config writes, check whether the flow should use existing batch-style APIs rather than multiple single-file requests.
6. For SSE/debug work, verify the full trigger -> event delivery -> frontend execution -> result callback chain instead of stopping at request emission.
7. Only after the audit, recommend the smallest next step and its validation plan.

Return:

- applicable endpoints and callers
- decision: frontend fix, backend gap, or data repair
- scope/compatibility risks
- smallest next change
- focused validation plan

Request:

{{input}}