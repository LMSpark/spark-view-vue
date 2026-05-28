import { describe, expect, it } from 'vitest'
import {
  JsonDocumentRuntime,
  PAGE_DATA_JSON_SCHEMA,
  PageEditor,
  PageModel,
  PageModelFactory,
  componentCatalog,
  createPageModel,
  createPageModelFactory,
} from '@spark-view/spark-page-config'
import {
  PageEditor as EditorSubpathPageEditor,
  componentCatalog as editorComponentCatalog,
  createRuleTreePolicy,
} from '@spark-view/spark-page-config/editor'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-component/runtime'
import {
  LEAVE_REQUEST_KIND,
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessKindDefinition,
  ensurePageDesignBusiness,
} from '@spark-view/spark-page-config/ai'

// 内化模块的测试通过内部源路径导入
import { PAGE_DESIGN_100_STEP_FLOW } from '../src/design/artifacts/design-flow'

describe('spark-page-config public subpath imports', () => {
  it('exposes PageModel and PageEditor as the public page-config surface', () => {
    const factory = createPageModelFactory({ fileStorage: 'memory' })
    const model = factory.create('orders')

    expect(PageModel).toBeTypeOf('function')
    expect(PageModelFactory).toBeTypeOf('function')
    expect(createPageModel('orders', { fileStorage: 'memory' })).toBeInstanceOf(PageModel)
    expect(model).toBeInstanceOf(PageModel)
    expect(model.pageId).toBe('orders')

    expect(PageEditor).toBeTypeOf('function')
    expect(EditorSubpathPageEditor).toBe(PageEditor)
    expect(componentCatalog).toBeTypeOf('object')
    expect(editorComponentCatalog).toBe(componentCatalog)
    expect(createRuleTreePolicy).toBeTypeOf('function')
    expect(PAGE_DATA_JSON_SCHEMA).toBeTypeOf('object')
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
    const editorExports = new Set(Object.keys(await import('@spark-view/spark-page-config/editor')))
    const forbidden = [
      'BasePageConfigLoader',
      'PageConfigLoader',
      'createConfigLoader',
      'PageConfigFileApi',
      'PageConfigFileDescriptor',
      'createPageEditorPreviewConfigLoader',
      'compileRule',
      'parsePageData',
      'parseScript',
      'parseCss',
      'ConfigLoadResult',
      'PageConfig',
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
      'PAGE_CONFIG_FILE_NAMES',
      'PageConfigFileName',
      'PageConfigFileVersionSummary',
      'PageConfigPageSummary',
    ]

    for (const name of forbidden) {
      expect(rootExports.has(name)).toBe(false)
      expect(editorExports.has(name)).toBe(false)
    }

    for (const name of ['PageModel', 'PageModelFactory', 'createPageModel', 'createPageModelFactory']) {
      expect(rootExports.has(name)).toBe(true)
      expect(editorExports.has(name)).toBe(false)
    }
  })
})
