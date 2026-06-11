import { describe, expect, it, vi } from 'vitest'
import { PageConfigModel } from '../../src/domain-model/page/page-config-model'
import type { PageContentLoader } from '../../src/io/page-content-loader'
import type { PageFileApi } from '../../src/io/page-file-api'

describe('PageConfigModel', () => {
  it('save writes four files via PageFileApi', async () => {
    const saveFileContent = vi.fn().mockResolvedValue(undefined)
    const api = { saveFileContent } as unknown as PageFileApi

    const model = new PageConfigModel({
      pageId: 'page-home',
      ruleJson: '[]',
      pageDataJson: '{}',
      script: '// js',
      style: '/* css */',
    })

    await model.save({ api })

    expect(saveFileContent).toHaveBeenCalledTimes(4)
    expect(saveFileContent).toHaveBeenCalledWith('page-home', 'rule.json', '[]')
    expect(saveFileContent).toHaveBeenCalledWith('page-home', 'pagedata.json', '{}')
    expect(saveFileContent).toHaveBeenCalledWith('page-home', 'script.js', '// js')
    expect(saveFileContent).toHaveBeenCalledWith('page-home', 'style.css', '/* css */')
  })

  it('load reads four files via PageContentLoader', async () => {
    const loader = {
      loadPageFileContent: vi.fn(async (_pageId: string, filename: string) => ({
        success: true,
        data: `content:${filename}`,
      })),
    } as unknown as PageContentLoader

    const model = await PageConfigModel.load({ pageId: 'page-home', loader })

    expect(model.pageId).toBe('page-home')
    expect(model.ruleJson).toBe('content:rule.json')
    expect(model.pageDataJson).toBe('content:pagedata.json')
    expect(model.script).toBe('content:script.js')
    expect(model.style).toBe('content:style.css')
  })
})
