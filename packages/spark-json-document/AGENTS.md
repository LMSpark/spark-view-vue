# @spark-appworks/spark-json-document

Generic JSON document tree editing engine.

## Public Surface

Single entry `.` — all functions and types from `src/index.ts`.

## Key Concepts

- UUID-stable identity: every node has unique id
- Internal tree model: TreeModel (Map<id, TreeNode>)
- Immutable mutations: all mutation functions return new MutationResult
- Policy injection: JsonTreePolicy for domain-specific behavior

## Dependencies

- `@spark-appworks/spark-utils` only (for `isRecord`)

## Verification

- `pnpm --dir packages/spark-json-document run build`
- `pnpm --dir packages/spark-json-document run typecheck`
