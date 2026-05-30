import { describe, expect, it } from 'vitest'
import {
  PageNodeFactory,
  ProjectModel,
  ProjectConfigPageNodeModel,
  createPageNode,
  createPageNodeFactory,
} from '@spark-view/spark-page-config'
import {
  ProjectEditor as EditorSubpathProjectEditor,
  PAGE_NODE_FILE_NAMES,
  PAGE_DATA_JSON_SCHEMA,
  componentCatalog,
  componentCatalog as editorComponentCatalog,
  createProjectEditor,
  createRuleTreePolicy,
} from '@spark-view/spark-page-config/project'
import { JsonDocumentRuntime } from '@spark-view/spark-page-config/json-document'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-component/runtime'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessKindDefinition,
  ensurePageDesignBusiness,
} from '@spark-view/spark-page-config/ai'
import {
  LEAVE_REQUEST_KIND,
} from '@spark-view/spark-page-config/leave-request'

// 内化模块的测试通过内部源路径导入
import { PAGE_DESIGN_100_STEP_FLOW } from '../src/page-model/update/artifacts/design-flow'

describe('spark-page-config public subpath imports', () => {
  it('exposes ProjectModel, typed page nodes and ProjectEditor as the public page-config surface', () => {
    const factory = createPageNodeFactory({ fileStorage: 'memory' })
    const model = factory.create('orders')

    expect(ProjectModel).toBeTypeOf('function')
    expect(ProjectConfigPageNodeModel).toBeTypeOf('function')
    expect(PageNodeFactory).toBeTypeOf('function')
    expect(createPageNode('orders', { fileStorage: 'memory' })).toBeInstanceOf(ProjectConfigPageNodeModel)
    expect(model).toBeInstanceOf(ProjectConfigPageNodeModel)
    expect(model.pageId).toBe('orders')

    expect(EditorSubpathProjectEditor).toBeTypeOf('function')
    expect(createProjectEditor).toBeTypeOf('function')
    expect(componentCatalog).toBeTypeOf('object')
    expect(editorComponentCatalog).toBe(componentCatalog)
    expect(createRuleTreePolicy).toBeTypeOf('function')
    expect(PAGE_DATA_JSON_SCHEMA).toBeTypeOf('object')
    expect(PAGE_NODE_FILE_NAMES).toEqual(['rule.json', 'pagedata.json', 'script.js', 'style.css'])
  })

  it('keeps independent runtime, json-document and AI public APIs available', () => {
    expect(PAGE_RUNTIME_SERVICES.toString()).toBe('spark:capability:page-runtime-services')

    const model = JsonDocumentRuntime.buildTreeModel({ hello: 'world' })
    expect(JsonDocumentRuntime.exportJsonDocument(model)).toEqual({ hello: 'world' })
    expect(PAGE_DESIGN_100_STEP_FLOW.length).toBeGreaterThan(0)

    expect(PAGE_DESIGN_MODULE_ID).toBe('pageDesign')
    expect(createPageDesignBusinessKindDefinition).toBeTypeOf('function')
    expect(ensurePageDesignBusiness).toBeTypeOf('function')
    expect(LEAVE_REQUEST_KIND).toBe('manual-leave')
  })

  it('does not leak loader, parser or file-api internals from public barrels', async () => {
    const rootExports = new Set(Object.keys(await import('@spark-view/spark-page-config')))
    const editorExports = new Set(Object.keys(await import('@spark-view/spark-page-config/project')))
    const rootForbidden = [
      'ProjectEditor',
      'createProjectEditor',
      'componentCatalog',
      'PAGE_DATA_JSON_SCHEMA',
      'PAGE_NODE_FILE_NAMES',
      'PageNavigationTools',
      'JsonDocumentRuntime',
    ]
    const implementationForbidden = [
      'BasePageConfigLoader',
      'BasePageContentLoader',
      'PageConfigLoader',
      'PageContentLoader',
      'createConfigLoader',
      'createPageContentLoader',
      'ConfigLoaderOptions',
      'PageContentLoaderOptions',
      'PageConfigFileApi',
      'PageNodeFileApi',
      'PageNodeFileDescriptor',
      'PageNodeFileRegistry',
      'PageNodeFilePath',
      'PageNodeFileCache',
      'PageNodeFileCreator',
      'PageNodeFileDeleter',
      'PageNodeFileVersions',
      'PageNodeNavigationOperations',
      'PageNavigationTools',
      'createDefaultPageNodeFileRegistry',
      'createProjectEditorPreviewConfigLoader',
      'createPageNodeInstance',
      'compileRule',
      'parsePageData',
      'parseScript',
      'parseCss',
      'ConfigLoadResult',
      'PageContentLoadResult',
      'PageConfig',
      'PageContentConfig',
      'PageContentConfigFiles',
      'RuleConfig',
      'PageDataConfig',
      'PageConfigEditWorkspace',
      'PageFileDocument',
      'PageDocumentRegistry',
      'PageRuleModel',
      'PageDataSetModel',
      'PageTextModel',
      'NavigationConfigClient',
      'NavigationEditSession',
      'buildNavRoot',
      'normalizeNavRoot',
      'findNodeById',
      'findConfigNodeByPageId',
      'PageConfigFileVersionSummary',
      'PageNodeFileVersionSummary',
    ]

    for (const name of [...rootForbidden, ...implementationForbidden]) {
      expect(rootExports.has(name)).toBe(false)
    }

    for (const name of implementationForbidden) {
      expect(editorExports.has(name)).toBe(false)
    }

    expect(rootExports.has('ProjectModel')).toBe(true)
    expect(editorExports.has('ProjectModel')).toBe(true)

    for (const name of ['PageNode']) {
      expect(rootExports.has(name)).toBe(false)
      expect(editorExports.has(name)).toBe(false)
    }

    for (const name of ['ProjectConfigPageNodeModel', 'PageNodeFactory', 'createPageNode', 'createPageNodeFactory']) {
      expect(rootExports.has(name)).toBe(true)
      expect(editorExports.has(name)).toBe(name === 'ProjectConfigPageNodeModel')
    }
  })
})
