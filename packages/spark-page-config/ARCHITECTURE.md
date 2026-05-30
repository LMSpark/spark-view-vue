# spark-page-config Package Architecture

`spark-page-config` is a framework-free domain model package.

## Current Shape

```text
ProjectModel
  nodes: ProjectNodeCollection
  planning: ProjectPlanningModel

ProjectNodeCollection
  flat nodes
  tree projection
  config page node cache

ProjectNodeModel
  navigation

ProjectConfigPageNodeModel
  rule
  dataSet
  script
  style
```

There is no standalone page aggregate and no standalone module-tree model. `page` and `sub-page` are both `ProjectConfigPageNodeModel`; `nodeKind` keeps their planning semantics.

## File Boundaries

```text
src/project/
  project-model.ts
  project-node-model.ts
  project-node-collection.ts
  project-node-tools.ts
  project-planning-model.ts
  project-editor.ts
  page-node-factory.ts

src/page-model/
  model/        page node child models and file use cases
  read/         four-file loading and compile helpers
  navigation/   navigation API adapters and mount operations
  update/       live edit services and design artifacts
  ai/           pageDesign registration
```

`page-model/` remains an internal content-domain folder. Public APIs speak in PageNode terms.

## Rules

- Keep this package free of Vue, Vue Router and UI services.
- Use class layering for models and use-case objects.
- Keep file create, delete, version and cache in separate classes.
- Use `ProjectNodeCollection` as the project node SSOT.
- Treat DB/navigation tree data as project nodes, not as a UI menu model.
- Fail fast on missing files, invalid node kinds or inconsistent state.
