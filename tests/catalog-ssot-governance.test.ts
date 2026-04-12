import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { projectHydratedComponent } from '@spark-view/spark-ai'
import type { ComponentCatalog } from '@spark-view/spark-ai'
import catalog from '../packages/spark-ai/src/catalog/component-catalog.json'
import { describe, expect, it } from 'vitest'

const typedCatalog = catalog as ComponentCatalog

describe('catalog SSoT governance', () => {
  const extractSchemaReferenceTypes = (schema: NonNullable<ComponentCatalog['schemaPool']>[string]): string[] => {
    if (schema.kind === 'object') {
      return Object.values(schema.properties).map((property) => property.type)
    }
    if (schema.kind === 'array') {
      return schema.itemTypes
    }
    if (schema.kind === 'event') {
      return schema.paramTypes
    }
    return schema.variants
  }

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const includesTypeToken = (text: string, typeName: string): boolean => {
    const pattern = new RegExp(`\\b${escapeRegExp(typeName)}\\b`)
    return pattern.test(text)
  }

  it('keeps single source artifact only', () => {
    const legacyPath = resolve(process.cwd(), 'packages/spark-ai/src/catalog/component-catalog.ai.json')
    expect(existsSync(legacyPath)).toBe(false)
  })

  it('keeps component index and count consistent', () => {
    const componentEntries = Object.entries(typedCatalog.components)
    expect(componentEntries.length).toBe(typedCatalog.componentCount)

    for (const [type, entry] of componentEntries) {
      expect(entry.type).toBe(type)
      expect(type).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it('enforces schemaPool reference integrity with no inline schema drift', () => {
    const schemaPool = typedCatalog.schemaPool ?? {}
    const usedSchemaRefs = new Set<string>()

    for (const entry of Object.values(typedCatalog.components)) {
      for (const prop of entry.props) {
        expect(prop.schema).toBeUndefined()
        if (prop.schemaRef !== undefined) {
          usedSchemaRefs.add(prop.schemaRef)
          const schema = schemaPool[prop.schemaRef]
          expect(schema).toBeDefined()
          expect(['object', 'array']).toContain(schema?.kind)
          if (schema !== undefined) {
            expect(
              prop.schemaRef === schema.type || prop.schemaRef.startsWith(`${schema.type}#`),
            ).toBe(true)
          }
        }
      }

      for (const emit of entry.emits) {
        expect(emit.schema).toBeUndefined()
        for (const schemaRef of emit.schemaRefs ?? []) {
          usedSchemaRefs.add(schemaRef)
          const schema = schemaPool[schemaRef]
          expect(schema).toBeDefined()
          expect(['object', 'array']).toContain(schema?.kind)
          if (schema !== undefined) {
            expect(schemaRef === schema.type || schemaRef.startsWith(`${schema.type}#`)).toBe(true)
          }
        }
      }
    }

    // schemaPool 内部引用也视为“已使用”（例如 SparkNodeChildren.itemTypes 引用 SparkTextChild）。
    for (const [schemaId, schema] of Object.entries(schemaPool)) {
      for (const typeText of extractSchemaReferenceTypes(schema)) {
        for (const candidateId of Object.keys(schemaPool)) {
          if (candidateId === schemaId) continue
          if (includesTypeToken(typeText, candidateId)) {
            usedSchemaRefs.add(candidateId)
          }
        }
      }
    }

    expect(Object.keys(schemaPool).length).toBe(usedSchemaRefs.size)
  })

  it('keeps registry categories aligned with component categories', () => {
    const components = typedCatalog.components
    const registry = typedCatalog.registry
    expect(registry).toBeDefined()

    for (const type of registry?.containers ?? []) {
      expect(components[type]?.category).toBe('container')
    }
    for (const type of registry?.fields ?? []) {
      expect(components[type]?.category).toBe('field')
    }
    for (const type of registry?.groups ?? []) {
      expect(components[type]?.category).toBe('group')
    }
    for (const type of registry?.meta ?? []) {
      expect(components[type]?.category).toBe('meta')
    }
  })

  it('hydrates schema refs for AI consumer projections', () => {
    for (const [type, entry] of Object.entries(typedCatalog.components)) {
      const hydrated = projectHydratedComponent(typedCatalog, type)
      expect(hydrated).not.toBeNull()

      for (let i = 0; i < entry.props.length; i += 1) {
        const originalProp = entry.props[i]
        const hydratedProp = hydrated?.props[i]
        if (originalProp?.schemaRef !== undefined) {
          expect(hydratedProp?.schema).toBeDefined()
        }
      }

      for (let i = 0; i < entry.emits.length; i += 1) {
        const originalEmit = entry.emits[i]
        const hydratedEmit = hydrated?.emits[i]
        if ((originalEmit?.schemaRefs?.length ?? 0) > 0) {
          expect(hydratedEmit?.schema).toBeDefined()
          expect((hydratedEmit?.schema?.length ?? 0)).toBe(originalEmit?.schemaRefs?.length)
        }
      }
    }
  })
})
