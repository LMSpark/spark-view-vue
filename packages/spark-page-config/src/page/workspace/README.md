# Page Workspace Domain

`src/page/workspace` owns the design-time page workspace inside
`spark-page-config`: editing, validating, document models, service operations,
and page lifecycle orchestration for `rule.json`, `pagedata.json`, `script.js`,
and `style.css`.

Public exports are collected in `index.ts`. Consumers import this workflow from
`@spark-view/spark-page-config/page/workspace`.

## Layers

```text
documents -> in-memory document models and generic JSON document editing core
editing   -> edit workspace, edit host registry, live edit session contracts
design    -> design-time schemas, policies, metadata, 100-step flow, and projection
services  -> service facade used by AI/page-design operations
lifecycle -> page file lifecycle orchestration, including navigation mount/remove
```

## Dependency Direction

```text
services -> editing -> documents
design   -> documents
lifecycle -> loading + navigation
```

Rules:

- `index.ts` is the only public workspace-domain barrel.
- Runtime loading and compiling stay in `src/page/loading`; workspace imports
  them only at lifecycle or API boundary points.
- Document models stay framework-free and do not import Vue or UI libraries.
- Design-time helpers may depend on document primitives, but not on loaders.
- The 100-step page design flow is a design-domain asset exposed through the
  service layer for AI/runtime guidance.
- Service facades depend on edit sessions and host contracts, not on UI code.
- Lifecycle orchestration is the only file-domain layer that coordinates with
  navigation mounting, movement, and removal.
