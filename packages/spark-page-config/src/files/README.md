# Page Config Files Domain

`src/files` owns the page file domain inside `spark-page-config`: reading,
compiling, editing, validating, and service operations for `rule.json`,
`pagedata.json`, `script.js`, and `style.css`.

Public exports are collected in `index.ts`. Consumers should continue importing
from `@spark-view/spark-page-config`; subfolders are internal organization.

## Layers

```text
runtime   -> file API, remote loading, raw file compilation
documents -> in-memory document models and generic JSON document editing core
editing   -> edit workspace, edit host registry, live edit session contracts
design    -> design-time schemas, policies, metadata, 100-step flow, and projection
services  -> service facade used by AI/page-design operations
lifecycle -> page file lifecycle orchestration, including navigation mount/remove
```

## Dependency Direction

```text
services -> editing -> documents -> runtime
design   -> documents
lifecycle -> runtime + navigation
runtime  -> package core types, spark-node, spark-node-tree
```

Rules:

- `index.ts` is the only public file-domain barrel.
- Runtime loading and compiling stay in `runtime`; they do not depend on editing
  or design-time modules.
- Document models stay framework-free and do not import Vue or UI libraries.
- Design-time helpers may depend on document primitives, but not on loaders.
- The 100-step page design flow is a design-domain asset exposed through the
  service layer for AI/runtime guidance.
- Service facades depend on edit sessions and host contracts, not on UI code.
- Lifecycle orchestration is the only file-domain layer that coordinates with
  navigation mounting, movement, and removal.
