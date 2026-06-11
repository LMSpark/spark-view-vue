import { describe, expect, it, vi } from 'vitest'
import { PageConfigModel } from '../../src/domain-model/page/page-config-model'
import type { PageFileApi } from '../../src/io/page-file-api'

describe('PageConfigModel.validate', () => {
  it('throws when pageId is empty', () => {
    const model = new PageConfigModel({ pageId: 'ok' })
    Object.assign(model, { pageId: '   ' })
    expect(() => model.validate()).toThrow('missing pageId')
  })

  it('runs before save', async () => {
    const api = { saveFileContent: vi.fn() } as unknown as PageFileApi
    const model = new PageConfigModel({ pageId: '   ' })
    await expect(model.save({ api })).rejects.toThrow('missing pageId')
    expect(api.saveFileContent).not.toHaveBeenCalled()
  })
})
