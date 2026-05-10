import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  COMPONENT_CATALOG_JSON,
  DEV_PROP_NAMES,
  projectFunctionCatalog,
  type ComponentCatalog,
} from '../packages/spark-ai/src/catalog'

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(fullPath))
    else files.push(fullPath)
  }
  return files
}

describe('@spark-view/spark-ai framework boundary', () => {
  const packageRoot = path.resolve(__dirname, '../packages/spark-ai')

  it('does not depend on the Vue renderer package', () => {
    const files = [
      path.join(packageRoot, 'package.json'),
      path.join(packageRoot, 'tsconfig.json'),
      path.join(packageRoot, 'tsconfig.build.json'),
      ...walkFiles(path.join(packageRoot, 'src'))
        .filter(file => file.endsWith('.ts')),
    ]

    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes('@spark-view/spark-component'))
    expect(offenders.map(file => path.relative(packageRoot, file))).toEqual([])
  })

  it('publishes a framework-neutral component catalog surface', () => {
    const catalog = COMPONENT_CATALOG_JSON as ComponentCatalog
    const functionCatalog = projectFunctionCatalog(catalog)
    const serializedCatalog = JSON.stringify(catalog)

    expect(serializedCatalog).not.toContain('modelValue')
    expect(serializedCatalog).not.toContain('update:modelValue')
    expect(serializedCatalog).not.toContain('Vue')
    expect(serializedCatalog).not.toContain('.vue')

    for (const entry of Object.values(catalog.components)) {
      expect(entry.props.map(prop => prop.name)).not.toContain('modelValue')
      expect(entry.emits?.map(emit => emit.name) ?? []).not.toContain('update:modelValue')
    }

    for (const entry of Object.values(functionCatalog.components)) {
      expect(entry.props.map(prop => prop.name)).not.toContain('modelValue')
      expect(entry.emits?.map(emit => emit.name) ?? []).not.toContain('update:modelValue')
    }

    for (const names of Object.values(DEV_PROP_NAMES)) {
      expect(names).not.toContain('modelValue')
    }
  })
})
