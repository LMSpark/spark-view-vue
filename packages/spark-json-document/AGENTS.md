# @spark-appworks/spark-json-document

Generic JSON document editing engine with JSON Schema types, construction, validation, and UUID-stable tree mutations.

## Public Surface

- `.` — all symbols (core + schema + tree)
- `./schema` — JSON Schema types, construction helpers, validator, resolution, withMeta
- `./tree` — tree editing engine (types, build, mutation, flatten)

## Directory Structure

```
src/
  index.ts           ← main barrel (re-exports all submodules)
  core/              ← JSON value types, path ops, coercion, parse/serialize
  schema/            ← JSON Schema types, helpers, validator (AJV), resolution, withMeta
  tree/              ← UUID-stable tree model, policy, mutations, flatten/restore
```

## Key Concepts

- UUID-stable identity: every tree node has unique id
- Internal tree model: TreeModel (Map<id, TreeNode>)
- Immutable mutations: all mutation functions return new MutationResult
- Policy injection: JsonTreePolicy for domain-specific behavior
- JSON Schema Draft 2020-12: types, construction helpers, AJV-based validation
- JSON value coercion: lossy and strict runtime-to-JSON conversion

## Dependencies

- `@spark-appworks/spark-utils` (for `isRecord`)
- `ajv` ^8.18.0 (for JSON Schema validation)

## Verification

- `pnpm --dir packages/spark-json-document run build`
- `pnpm --dir packages/spark-json-document run typecheck`
