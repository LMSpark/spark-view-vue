import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { auditVcmNativeClassLifecycle } from '../vcm-native-class-lifecycle-audit'

const root = resolve(import.meta.dirname, '../../../..')

describe('auditVcmNativeClassLifecycle', () => {
  it('requires toJson/fromJson for snapshot kinds and exempts session kinds', () => {
    const program = ts.createProgram(
      [
        resolve(root, 'packages/spark-data/src/dataset-crud-tool.ts'),
        resolve(root, 'packages/spark-project-model/src/project/project-model.ts'),
      ],
      { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    )
    const findings = auditVcmNativeClassLifecycle({
      program,
      apis: [
        {
          kind: 'dataset',
          className: 'DataSetCrudTool',
          actions: [{ methodName: 'toJson' }],
        },
        {
          kind: 'project',
          className: 'ProjectModel',
          actions: [],
        },
      ],
    })
    expect(findings.some(finding => finding.rule === 'lifecycle-missing-toJson' && finding.target === 'dataset')).toBe(false)
    expect(findings.some(finding => finding.target === 'project')).toBe(false)
  })
})
