# spark-page-config Architecture

`spark-page-config` owns the framework-free page configuration boundary. It does not import Vue, Vue Router, or Element Plus; renderer and application packages consume it through explicit subpaths.

## Public Layers

```text
config -> node-tree -> navigation -> runtime -> json-document -> design -> ai
```

- `@spark-view/spark-page-config/config` is the runtime four-file protocol: file registry, loader, compiler, and page-config file API.
- `@spark-view/spark-page-config/node-tree` owns `SparkNode` and `SparkNodeTree`.
- `@spark-view/spark-page-config/navigation` owns navigation DTOs, normalization, edit sessions, and the navigation API client.
- `@spark-view/spark-page-config/runtime` owns script context types and `PAGE_RUNTIME_SERVICES`.
- `@spark-view/spark-page-config/json-document` is the generic JSON tree editor model.
- `@spark-view/spark-page-config/design` owns page file documents, edit workspace, lifecycle, design service, and design artifacts.
- `@spark-view/spark-page-config/ai` owns pageDesign and manualLeave business registration.

The package root intentionally remains small: it exports only the config loader runtime surface. Do not reintroduce the old `page/*`, `capabilities/*`, or `registrations` subpaths.

## Runtime Flow

```text
raw four files
  -> PageConfigFileRegistry
  -> PageConfigLoader
  -> PageConfigCompiler
  -> PageConfig
  -> SparkPageRenderer
```

The four canonical files are `rule.json`, `pagedata.json`, `script.js`, and `style.css`. Required-file semantics live in `PageConfigFileRegistry`; loader behavior should derive from descriptors instead of separate file-name arrays.

`rule.json` compiles into normalized `SparkNode` children. `pagedata.json` compiles through `spark-data` into a `DataSet`. `script.js` and `style.css` stay text-backed at this layer.

## Design Flow

```text
PageFileDocument
  -> PageConfigEditWorkspace
  -> PageDesignService
  -> ai business registration
```

Design-time editing uses documents as the single source of truth:

- `rule.json` is model-backed by `SparkNodeTree`.
- `pagedata.json` is model-backed by `DataSetCrudTool`.
- `script.js` and `style.css` are text-backed with snapshot history.

The workspace handles active page state, dirty checks, loader cache invalidation, and version actions. AI registration only projects these design capabilities into module-semantic tools; it must not pull AI-specific concerns back into `config`, `runtime`, or `design` core models.

## Import Rules

Use explicit subpaths:

```ts
import { createConfigLoader } from '@spark-view/spark-page-config/config'
import { SparkNodeTree } from '@spark-view/spark-page-config/node-tree'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-page-config/runtime'
```

Do not import from removed paths such as `@spark-view/spark-page-config/page/loading`, `@spark-view/spark-page-config/capabilities/page-file-document`, or `@spark-view/spark-page-config/registrations`.
