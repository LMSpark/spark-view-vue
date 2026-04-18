import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('app shell AI entry removal', () => {
  const root = path.resolve(__dirname, '..')
  const appSource = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8')
  const mainSource = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8')

  it('should not mount the global AiAssistantHub from App.vue', () => {
    expect(appSource).not.toContain('<AiAssistantHub')
    expect(appSource).not.toContain("import('@/components/AiAssistantHub.vue')")
  })

  it('should not expose the legacy App AI window flag from main.ts', () => {
    expect(mainSource).not.toContain('__SPARK_ENABLE_AI')
  })
})