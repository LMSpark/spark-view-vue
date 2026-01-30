import { describe, it, expect } from 'vitest'
import { componentRegistry } from '../src/utils/SparkComponentRegistry'

describe('findCompatibleProviders', () => {
  it('returns types that provide capability with no minVersion', () => {
    componentRegistry.register('a', { type: 'a', name: 'a', version: '1.0.0', component: {} as any, providers: [{ name: 'cap', version: '1.0.0' }] })
    componentRegistry.register('b', { type: 'b', name: 'b', version: '1.0.0', component: {} as any, providers: [{ name: 'other', version: '1.0.0' }] })
    expect(componentRegistry.findCompatibleProviders('cap')).toContain('a')
  })

  it('filters by minVersion', () => {
    componentRegistry.register('c', { type: 'c', name: 'c', version: '1.0.0', component: {} as any, providers: [{ name: 'cap', version: '2.0.0' }] })
    expect(componentRegistry.findCompatibleProviders('cap', '1.5.0')).toContain('c')
    expect(componentRegistry.findCompatibleProviders('cap', '2.0.0')).toContain('c')
    expect(componentRegistry.findCompatibleProviders('cap', '2.1.0')).not.toContain('c')
  })

  it('supports semver ranges and prerelease', () => {
    componentRegistry.register('d', { type: 'd', name: 'd', version: '1.2.0', component: {} as any, providers: [{ name: 'cap', version: '1.2.0-alpha.1' }] })
    componentRegistry.register('e', { type: 'e', name: 'e', version: '1.2.3', component: {} as any, providers: [{ name: 'cap', version: '1.2.3' }] })

    // exact prerelease match
    expect(componentRegistry.findCompatibleProviders('cap', '1.2.0-alpha.1')).toContain('d')

    // range that excludes prerelease should not include prerelease
    expect(componentRegistry.findCompatibleProviders('cap', '>=1.2.0')).toContain('e')
    expect(componentRegistry.findCompatibleProviders('cap', '>=1.2.0')).not.toContain('d')

    // caret range should include stable 1.2.x
    expect(componentRegistry.findCompatibleProviders('cap', '^1.2.0')).toContain('e')

    // complex range
    expect(componentRegistry.findCompatibleProviders('cap', '>=1.0.0 <2.0.0')).toContain('e')
    expect(componentRegistry.findCompatibleProviders('cap', '>=1.0.0 <2.0.0')).not.toContain('d')
  })
})