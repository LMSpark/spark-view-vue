import { describe, expect, it } from 'vitest'
import {
  PAGE_CONFIG_FILE_NAMES,
  compileRule,
  PageConfigFileDescriptor,
  PageConfigFileApi,
  createConfigLoader,
} from '@spark-view/spark-page-config'
import { SparkNodeTree } from '@spark-view/spark-data'
import { NavigationEditSession, buildNavRoot } from '@spark-view/spark-page-config/editor'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-component/runtime'
import {
  PageEditor,
  componentCatalog,
  createRuleTreePolicy,
} from '@spark-view/spark-page-config/editor'
import { buildTreeModel, exportJsonDocument } from '@spark-view/spark-page-config/json-document'
import { PageConfigLoader as RootPageConfigLoader } from '@spark-view/spark-page-config'

// 内化模块的测试通过内部源路径导入
import { PAGE_DESIGN_100_STEP_FLOW } from '../src/design/index'
import { LEAVE_REQUEST_KIND, PAGE_DESIGN_MODULE_ID, createPageDesignBusinessKindDefinition } from '../src/ai/index'

describe('spark-page-config public subpath imports', () => {
  it('exposes PageEditor from the ./editor subpath', () => {
    expect(PageEditor).toBeTypeOf('function')
    expect(componentCatalog).toBeTypeOf('object')
    expect(createRuleTreePolicy).toBeTypeOf('function')
  })

  it('exposes the runtime config root', () => {
    expect(RootPageConfigLoader).toBeTypeOf('function')
    expect(createConfigLoader({ fileStorage: 'memory' })).toBeInstanceOf(RootPageConfigLoader)
    expect(PageConfigFileApi).toBeTypeOf('function')
    expect(new PageConfigFileDescriptor({ name: 'custom.json', required: false }).name).toBe('custom.json')

    expect(compileRule('[]')).toEqual([])
    expect(PAGE_CONFIG_FILE_NAMES).toEqual(['rule.json', 'pagedata.json', 'script.js', 'style.css'])

    const tree = SparkNodeTree.fromPageChildren([{ type: 'div', id: 'root-child' }])
    expect(tree.getNode({ componentId: 'root-child' })?.type).toBe('div')

    const navSession = new NavigationEditSession()
    navSession.replaceRoot(buildNavRoot([]))
    expect(navSession.children).toEqual([])

    expect(PAGE_RUNTIME_SERVICES.toString()).toBe('spark:capability:page-runtime-services')

    const model = buildTreeModel({ hello: 'world' })
    expect(exportJsonDocument(model)).toEqual({ hello: 'world' })
    expect(PAGE_DESIGN_100_STEP_FLOW.length).toBeGreaterThan(0)

    expect(PAGE_DESIGN_MODULE_ID).toBe('pageDesign')
    expect(createPageDesignBusinessKindDefinition).toBeTypeOf('function')
    expect(LEAVE_REQUEST_KIND).toBe('manual-leave')
    expect(typeof componentCatalog).toBe('object')
  })

  it('keeps pageDesign implementation details out of public import barrels', async () => {
    const designModule = await import('../src/design/index')
    const aiModule = await import('../src/ai/index')
    const rootModule = await import('@spark-view/spark-page-config')

    // root 只导出 config 运行时 API
    expect(typeof rootModule.BasePageConfigLoader).toBe('function')
    expect(typeof rootModule.createConfigLoader).toBe('function')

    // 实现细节不在公开 barrel 中
    const designExports = new Set(Object.keys(designModule))
    for (const name of ['PageDesignService', 'PageDesignEditSession', 'pageDesignServiceFailure', 'registerPageDesignEditHost']) {
      expect(designExports.has(name)).toBe(false)
    }
    const aiExports = new Set(Object.keys(aiModule))
    for (const name of [
      'PageDesignDatasetAiModule',
      'PageDesignLifecycleAiModule',
      'PageDesignNodeTreeAiModule',
      'PageDesignPayloadCatalogAiModule',
      'PageDesignTextModelAiModule',
      'createPageDesignComponentPayloadProvider',
      'createPageDesignPayloadRegistry',
      'hasPageDesignComponentPayloadKey',
      'isPageDesignWritableComponentPayloadKey',
    ]) {
      expect(aiExports.has(name)).toBe(false)
    }
  })
})
