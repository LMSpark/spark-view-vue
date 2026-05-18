import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useColorScheme scoped storage', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  it('isolates color scheme state by storage scope', async () => {
    const { setColorSchemeStorageScope, useColorScheme } = await import('../navigation/useColorScheme')
    const scheme = useColorScheme()

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')
    scheme.setPrimaryColor('#722ed1')
    scheme.setNavPreset(3)

    setColorSchemeStorageScope('tenant:lmspark:project:engineering-pm')
    expect(scheme.primaryColor.value).toBe('#409eff')
    expect(scheme.navPresetIndex.value).toBe(0)

    scheme.setStylePreset(1)
    expect(scheme.primaryColor.value).toBe('#2f6feb')

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')
    expect(scheme.primaryColor.value).toBe('#722ed1')
    expect(scheme.navPresetIndex.value).toBe(3)
    expect(scheme.stylePresetIndex.value).toBe(0)
  })

  it('copies legacy global color scheme into the first scoped key', async () => {
    const legacy = { primaryColor: '#14b8a6', navIndex: 6, styleIndex: 3 }
    localStorage.setItem('spark-color-scheme', JSON.stringify(legacy))

    const { setColorSchemeStorageScope, useColorScheme } = await import('../navigation/useColorScheme')
    const scheme = useColorScheme()

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')

    expect(scheme.primaryColor.value).toBe('#14b8a6')
    expect(scheme.navPresetIndex.value).toBe(6)
    expect(scheme.stylePresetIndex.value).toBe(3)
    expect(localStorage.getItem('spark-color-scheme:tenant:lmspark:project:homepage')).toBe(JSON.stringify(legacy))
    expect(localStorage.getItem('spark-color-scheme')).toBe(JSON.stringify(legacy))
  })

  it('refreshes CSS variables when switching scopes', async () => {
    const { setColorSchemeStorageScope, useColorScheme } = await import('../navigation/useColorScheme')
    const scheme = useColorScheme()

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')
    scheme.setPrimaryColor('#722ed1')
    expect(document.documentElement.style.getPropertyValue('--el-color-primary')).toBe('#722ed1')

    setColorSchemeStorageScope('tenant:lmspark:project:engineering-pm')
    expect(document.documentElement.style.getPropertyValue('--el-color-primary')).toBe('#409eff')
  })
})
