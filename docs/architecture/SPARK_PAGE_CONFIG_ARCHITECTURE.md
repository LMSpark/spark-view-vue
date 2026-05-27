# spark-page-config Architecture

`spark-page-config` owns the framework-free page configuration boundary. It does not import Vue, Vue Router, or Element Plus; renderer and application packages consume it through the package root, `./editor`, and `./json-document`.

## Public Layers

```text
root config runtime -> editor aggregate -> json-document public helpers
```

- `@spark-view/spark-page-config` is the runtime four-file protocol: loader, compiler, and page-config file API.
- `@spark-view/spark-page-config/editor` is the DevSystem editing SSOT: `PageEditor` delegates to workspace, lifecycle, navigation, `SparkNodeTree`, `DataSetCrudTool`, and preview config builders.
- `@spark-view/spark-page-config/json-document` is the generic JSON tree editor model.

The package root intentionally remains small: it exports only the config runtime surface. Do not reintroduce the old `config`, `node-tree`, `navigation`, `runtime`, `design`, `ai`, `page/*`, `capabilities/*`, or `registrations` subpaths.

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
PageEditor
  -> PageConfigEditWorkspace
  -> PageConfigFileLifecycle
  -> NavigationEditSession / NavigationConfigClient
  -> SparkNodeTree / DataSetCrudTool / PageFileDocument
```

Design-time editing uses documents as the single source of truth:

- `rule.json` is model-backed by `SparkNodeTree`.
- `pagedata.json` is model-backed by `DataSetCrudTool`.
- `script.js` and `style.css` are text-backed with snapshot history.

`PageEditor` is the public editing gateway. Lower-level workspace, lifecycle, navigation, and document primitives stay internal implementation details; DevSystem should not import or operate them directly.

## Import Rules

Use only the public package root and explicit editor/json-document subpaths:

```ts
import { createConfigLoader } from '@spark-view/spark-page-config'
import { PageEditor } from '@spark-view/spark-page-config/editor'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-component'
```

Do not import from removed spark-page-config subpaths such as config, node-tree, navigation, runtime, design, ai, page/loading, capabilities/page-file-document, or registrations.
