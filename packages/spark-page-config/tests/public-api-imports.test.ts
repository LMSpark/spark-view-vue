import { describe, expect, it } from 'vitest'
import {
  PAGE_CONFIG_FILE_NAMES,
  PageConfigCompiler,
  PageConfigFileDescriptor,
  PageConfigFileApi,
  createConfigLoader,
} from '@spark-view/spark-page-config/config'
import { SparkNodeTree } from '@spark-view/spark-page-config/node-tree'
import { NavigationEditSession, buildNavRoot } from '@spark-view/spark-page-config/navigation'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-page-config/runtime'
import { buildTreeModel, exportJsonDocument } from '@spark-view/spark-page-config/json-document'
import { PAGE_DESIGN_100_STEP_FLOW, createPageDocuments } from '@spark-view/spark-page-config/design'
import { LEAVE_REQUEST_KIND, PAGE_DESIGN_MODULE_ID, createPageDesignBusinessKindDefinition } from '@spark-view/spark-page-config/ai'
import componentCatalog from '@spark-view/spark-page-config/ai/payloads/component-catalog.json'
import { PageConfigLoader as RootPageConfigLoader } from '@spark-view/spark-page-config'

describe('spark-page-config public subpath imports', () => {
  it('exposes the runtime config root and explicit semantic layers', () => {
    expect(RootPageConfigLoader).toBeTypeOf('function')
    expect(createConfigLoader({ fileStorage: 'memory' })).toBeInstanceOf(RootPageConfigLoader)
    expect(PageConfigFileApi).toBeTypeOf('function')
    expect(new PageConfigFileDescriptor({ name: 'custom.json', required: false }).name).toBe('custom.json')

    const compiler = new PageConfigCompiler()
    expect(compiler.compileRule('[]')).toEqual([])
    expect(PAGE_CONFIG_FILE_NAMES).toEqual(['rule.json', 'pagedata.json', 'script.js', 'style.css'])

    const tree = SparkNodeTree.fromPageChildren([{ type: 'div', id: 'root-child' }])
    expect(tree.getNode({ componentId: 'root-child' })?.type).toBe('div')

    const navSession = new NavigationEditSession()
    navSession.replaceRoot(buildNavRoot([]))
    expect(navSession.children).toEqual([])

    expect(PAGE_RUNTIME_SERVICES.toString()).toBe('spark:capability:page-runtime-services')

    const model = buildTreeModel({ hello: 'world' })
    expect(exportJsonDocument(model)).toEqual({ hello: 'world' })

    const documents = createPageDocuments()
    expect(Object.keys(documents)).toEqual([...PAGE_CONFIG_FILE_NAMES])
    expect(PAGE_DESIGN_100_STEP_FLOW.length).toBeGreaterThan(0)

    expect(PAGE_DESIGN_MODULE_ID).toBe('pageDesign')
    expect(createPageDesignBusinessKindDefinition).toBeTypeOf('function')
    expect(LEAVE_REQUEST_KIND).toBe('manual-leave')
    expect(typeof componentCatalog).toBe('object')
  })

  it('keeps pageDesign implementation details out of public import barrels', async () => {
    const designModule = await import('@spark-view/spark-page-config/design')
    const aiModule = await import('@spark-view/spark-page-config/ai')
    const designExports = new Set(Object.keys(designModule))
    const aiExports = new Set(Object.keys(aiModule))

    for (const name of ['PageDesignService', 'PageDesignEditSession', 'pageDesignServiceFailure', 'registerPageDesignEditHost']) {
      expect(designExports.has(name)).toBe(false)
    }
    for (const name of [
      'PageDesignDatasetModuleKind',
      'PageDesignLifecycleModuleKind',
      'PageDesignNodeTreeModuleKind',
      'PageDesignPayloadCatalogModuleKind',
      'PageDesignTextModelModuleKind',
      'createPageDesignComponentPayloadProvider',
      'createPageDesignPayloadRegistry',
      'hasPageDesignComponentPayloadKey',
      'isPageDesignWritableComponentPayloadKey',
    ]) {
      expect(aiExports.has(name)).toBe(false)
    }
  })
})
