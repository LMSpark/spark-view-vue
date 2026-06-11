import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from '../class-model/dts-bundle-types'
import { buildDtsClassModelBundle } from '../class-model/build-dts-class-model-bundle'
import { projectDtsFileProjection } from '../class-model/project-from-declarations'
import {
  readDtsClassModelBundleManifest,
  readDtsFileProjectionDocument,
} from '../class-model/read-dts-class-model-bundle-json'

describe('readDtsClassModelBundleJson', () => {
  it('parses generated manifest with structural validation', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-manifest-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'declarations/packages/spark-utils/src/ai-model.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** AI editable model base. */',
        'export abstract class SparkAIModel {',
        '  /** Converts model state to JSON. */',
        '  abstract toJson(): Record<string, unknown>',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const raw: unknown = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
      const manifest = readDtsClassModelBundleManifest(raw)
      expect(manifest.schemaVersion).toBe(DTS_CLASS_MODEL_BUNDLE_VERSION)
      expect(manifest.protocol).toBe(DTS_CLASS_MODEL_BUNDLE_PROTOCOL)
      expect(Object.keys(manifest.classIndex)).toContain('SparkAIModel')
      expect(Object.keys(manifest.files)).toContain(sourcePath)
      expect(manifest.files[sourcePath]?.module).toMatchObject({
        name: '@spark-appworks/spark-utils:ai-model',
        sourceFile: 'packages/spark-utils/src/ai-model.ts',
        jsdocSource: 'inferred',
      })
      expect(manifest.files[sourcePath]?.module.symbols).toContain('SparkAIModel')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('parses a generated per-file projection shard', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-shard-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'declarations/packages/spark-utils/src/ai-model.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** AI editable model base. */',
        'export abstract class SparkAIModel {',
        '  /** Converts model state to JSON. */',
        '  abstract toJson(): Record<string, unknown>',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const entry = result.manifest.files[sourcePath]
      if (entry === undefined) throw new Error(`Missing test shard entry: ${sourcePath}`)
      const raw: unknown = JSON.parse(readFileSync(resolve(outputDir, entry.file), 'utf8'))
      const projection = readDtsFileProjectionDocument(raw)
      expect(projection.schemaVersion).toBe(DTS_FILE_PROJECTION_VERSION)
      expect(projection.module).toMatchObject({
        name: '@spark-appworks/spark-utils:ai-model',
        sourceFile: 'packages/spark-utils/src/ai-model.ts',
        modulePath: 'ai-model',
        jsdocSource: 'inferred',
      })
      expect(projection.symbols).toContain('SparkAIModel')
      expect(Object.keys(projection.models)).toContain('SparkAIModel')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('classifies spark component declarations from dts paths', () => {
    const cases = [
      {
        sourcePath: 'declarations/packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.props.d.ts',
        declaration: 'export type RTableProps = { dataViewKey?: string }',
        className: 'RTableProps',
        expected: {
          componentName: 'RendererTable',
          componentType: 'r-table',
          componentLevel: 'table-level',
          componentLayer: 'data-view-container',
          componentDirectory: 'containers/data-views',
        },
      },
      {
        sourcePath: 'declarations/packages/spark-component/src/components/containers/layout/RendererSection/RendererSection.props.d.ts',
        declaration: 'export type RSectionProps = { title?: string }',
        className: 'RSectionProps',
        expected: {
          componentName: 'RendererSection',
          componentType: 'r-section',
          componentLevel: 'container',
          componentLayer: 'layout-container',
          componentDirectory: 'containers/layout',
        },
      },
      {
        sourcePath: 'declarations/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts',
        declaration: 'export type RTextProps = { field?: string }',
        className: 'RTextProps',
        expected: {
          componentName: 'FieldText',
          componentType: 'r-text',
          componentLevel: 'field-level',
          componentLayer: 'data-field',
          componentDirectory: 'fields/data-components',
        },
      },
    ]
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-${String(process.pid)}-${String(Date.now())}`)
    try {
      for (const item of cases) {
        const absolutePath = resolve(tempRoot, item.sourcePath)
        mkdirSync(dirname(absolutePath), { recursive: true })
        writeFileSync(absolutePath, `${item.declaration}\n`, 'utf8')
        const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
        expect(projection.models[item.className]?.provenance).toMatchObject(item.expected)
        expect(projection.module).toMatchObject(item.expected)
        expect(projection.module.jsdoc).toContain(String(item.expected.componentLayer))
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('captures module-level leading jsdoc before imports', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-module-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'declarations/packages/spark-project-model/src/project/project-workspace.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/**',
        ' * ProjectWorkspace module boundary.',
        ' * Owns project editing IO and delegates state to ProjectModel.',
        ' */',
        "import type { HttpClientBase } from '@spark-appworks/spark-utils'",
        '/** Workspace options. */',
        'export type ProjectWorkspaceOptions = { http: HttpClientBase }',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.module).toMatchObject({
        name: '@spark-appworks/spark-project-model:project/project-workspace',
        sourceFile: 'packages/spark-project-model/src/project/project-workspace.ts',
        modulePath: 'project/project-workspace',
        jsdocSource: 'leading-jsdoc',
      })
      expect(projection.module.jsdoc).toContain('ProjectWorkspace module boundary')
      expect(projection.models['ProjectWorkspaceOptions']?.jsdoc).toContain('Workspace options')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('captures module-level source file comments when dts cannot carry them', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-source-module-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'declarations/packages/spark-component/src/components/containers/layout/RendererButton.vue.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const vueSourcePath = resolve(tempRoot, 'packages/spark-component/src/components/containers/layout/RendererButton.vue')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      mkdirSync(dirname(vueSourcePath), { recursive: true })
      writeFileSync(vueSourcePath, [
        '<!--',
        '@module RendererButton',
        'RendererButton 模块封装按钮容器的显示、动作触发和禁用态语义。',
        '-->',
        '<template><button /></template>',
      ].join('\n'), 'utf8')
      writeFileSync(absolutePath, [
        '/** Button props. */',
        'export type RButtonProps = { text?: string }',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.module).toMatchObject({
        sourceFile: 'packages/spark-component/src/components/containers/layout/RendererButton.vue',
        jsdocSource: 'source-file-jsdoc',
        componentName: 'RendererButton',
      })
      expect(projection.module.jsdoc).toContain('按钮容器')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('preserves raw declaration relations from dts syntax', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-relations-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'declarations/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        'export type SparkNodeProps = { id?: string }',
        'export type SparkFieldSemanticProps<T> = { value?: T }',
        'export interface RBaseProps { base?: string }',
        'export interface RDerivedProps extends RBaseProps { label?: string }',
        'export type RTextProps = SparkNodeProps & SparkFieldSemanticProps<string>',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.models['RDerivedProps']?.declarationRelations).toEqual([
        {
          kind: 'extends',
          typeText: 'RBaseProps',
          targetName: 'RBaseProps',
        },
      ])
      expect(projection.models['RTextProps']?.declarationTypeText)
        .toBe('SparkNodeProps & SparkFieldSemanticProps<string>')
      expect(projection.models['RTextProps']?.declarationRelations).toEqual([
        {
          kind: 'intersection',
          typeText: 'SparkNodeProps',
          targetName: 'SparkNodeProps',
        },
        {
          kind: 'intersection',
          typeText: 'SparkFieldSemanticProps<string>',
          targetName: 'SparkFieldSemanticProps',
        },
      ])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('writes semantic gap logs for declarations missing jsdoc', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-log-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'declarations/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        'export type RTextProps = {',
        '  /** Bound data field name. */',
        '  field?: string',
        '  missingLabel?: string',
        '}',
        'export class DemoModel {',
        '  /** Display name. */',
        '  name: string',
        '  missingCount: number',
        '  /** Saves the current model. */',
        '  save(): void',
        '  reset(): void',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const report = JSON.parse(readFileSync(result.semanticLogJsonPath, 'utf8')) as {
        gapCount: number
        notes: string[]
        gaps: Array<{
          className: string
          kind: string
          memberName?: string
          reason: string
          chainBreak: string
          fixHint: string
          sourceFile: string
        }>
      }
      const logText = readFileSync(result.semanticLogPath, 'utf8')
      const gapIds = report.gaps.map(gap => `${gap.kind}:${gap.className}.${gap.memberName ?? '<model>'}`)

      expect(report.gapCount).toBe(result.semanticGapCount)
      expect(gapIds).toContain('model:RTextProps.<model>')
      expect(gapIds).toContain('attribute:RTextProps.missingLabel')
      expect(gapIds).toContain('model:DemoModel.<model>')
      expect(gapIds).toContain('attribute:DemoModel.missingCount')
      expect(gapIds).toContain('method:DemoModel.reset')
      expect(gapIds).not.toContain('attribute:RTextProps.field')
      expect(gapIds).not.toContain('attribute:DemoModel.name')
      expect(gapIds).not.toContain('method:DemoModel.save')
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')?.sourceFile)
        .toBe('packages/spark-component/src/components/fields/data-components/FieldText.props.ts')
      expect(report.notes.join('\n')).toContain('.d.ts')
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')).toMatchObject({
        reason: 'missing-jsdoc',
      })
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')?.chainBreak)
        .toContain('RTextProps.missingLabel')
      expect(report.gaps.find(gap => gap.memberName === 'missingLabel')?.fixHint)
        .toContain('FieldText.props.ts')
      expect(logText).toContain('[attribute] RTextProps.missingLabel')
      expect(logText).toContain('reason: missing-jsdoc')
      expect(logText).toContain('chainBreak:')
      expect(logText).toContain('component: type=r-text; name=FieldText; level=field-level')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects manifest with wrong protocol', () => {
    expect(() => readDtsClassModelBundleManifest({
      schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
      protocol: 'legacy',
      generatedAt: '2026-01-01T00:00:00.000Z',
      scannedFileCount: 0,
      files: {},
      classIndex: {},
    })).toThrow(/protocol/)
  })

  it('rejects projection missing required class model fields', () => {
    expect(() => readDtsFileProjectionDocument({
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      sourcePath: 'declarations/x.d.ts',
      symbols: ['Broken'],
      models: {
        Broken: {
          kind: 'Broken',
        },
      },
    })).toThrow(/className/)
  })
})
