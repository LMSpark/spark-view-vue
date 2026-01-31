import { describe, it, expect } from 'vitest'
import { ConfigManager, setConfig, getConfig, clearConfig } from '../src/utils/configManager.js'

describe('ConfigManager', () => {
  it('set and get config', () => {
    setConfig({ foo: 'bar' })
    expect(getConfig('foo')).toBe('bar')
  })

  it('clearConfig and reset', () => {
    setConfig({ a: 1 })
    expect(getConfig('a')).toBe(1)
    clearConfig()
    expect(getConfig('a')).toBeUndefined()
  })
})