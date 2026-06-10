import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createVcmNativeKnowledgeWorkerApi } from '../knowledge/worker-knowledge-handler'
import { resolveBundleRelativeUrl } from '../metadata/vcm-bundle-loader'

const root = resolve(import.meta.dirname, '../../../../..')
const distDir = resolve(root, 'generated/vcm/dist/project-page-surface')
const manifestUrl = 'bundle://project-page-surface/manifest.json'

describe('VCM bundle knowledge worker', () => {
  it('loads manifestUrl on demand and resolves attributeGuide importKinds', async () => {
    const fetchedUrls: string[] = []
    const api = createVcmNativeKnowledgeWorkerApi({
      fetchJson: async (url) => {
        fetchedUrls.push(url)
        return readBundleJson(url)
      },
    })

    await api.init({ manifestUrl })

    const attributeGuide = await api.attributeGuide({
      kind: 'config-page',
      attributeName: 'nodeTree',
    })

    expect(attributeGuide).toContain('nodeTree')
    expect(attributeGuide).toContain('SparkNodeTree')
    expect(fetchedUrls[0]).toBe(manifestUrl)
    expect(fetchedUrls).toContain(resolveBundleRelativeUrl(manifestUrl, '$defs.json'))
    expect(fetchedUrls).toContain(resolveBundleRelativeUrl(manifestUrl, 'kinds/project.json'))
    expect(fetchedUrls).toContain(resolveBundleRelativeUrl(manifestUrl, 'kinds/config-page.json'))
    expect(fetchedUrls).toContain(resolveBundleRelativeUrl(manifestUrl, 'kinds/node-tree.json'))
    expect(fetchedUrls).toContain(resolveBundleRelativeUrl(manifestUrl, 'kinds/dataset.json'))
  })

  it('fails fast when component catalog fetch fails during methodGuide merge', async () => {
    const api = createVcmNativeKnowledgeWorkerApi({
      fetchJson: async (url) => readBundleJson(url),
    })
    await api.init({
      manifestUrl,
      componentCatalogUrl: 'catalog://components',
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(null, { status: 404 })
    try {
      await expect(api.methodGuide({
        kind: 'node-tree',
        methodName: 'addNode',
        componentType: 'r-table',
      })).rejects.toThrow(/Failed to load component catalog/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

function readBundleJson(url: string): unknown {
  if (url === manifestUrl) {
    return readJson(resolve(distDir, 'manifest.json'))
  }
  if (url === resolveBundleRelativeUrl(manifestUrl, '$defs.json')) {
    return readJson(resolve(distDir, '$defs.json'))
  }
  if (url.startsWith(resolveBundleRelativeUrl(manifestUrl, 'kinds/'))) {
    const fileName = url.slice(url.lastIndexOf('/') + 1)
    return readJson(resolve(distDir, 'kinds', fileName))
  }
  throw new Error(`missing test bundle document: ${url}`)
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}
