import { describe, expect, it } from 'vitest'
import { createPageDocuments } from '../src/views/app/dev-system/page-file-documents'

function isDocumentDirty(doc: { text: { value: string }; savedText: { value: string } }): boolean {
  return doc.text.value !== doc.savedText.value
}

function makePageDataText(label: string): string {
  return JSON.stringify({
    dataSetName: 'TestDS',
    tables: {
      Items: {
        tableName: 'Items',
        columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
        views: { default: { rows: [{ id: 1, label }] } },
      },
    },
  })
}

describe('PageFileDocument primitives', () => {
  describe('TextDocument (script.js)', () => {
    it('loads, edits, undoes and marks saved', () => {
      const docs = createPageDocuments()
      const doc = docs['script.js']

      doc.loadFromText('// v1\n')
      expect(isDocumentDirty(doc)).toBe(false)
      expect(doc.canUndo.value).toBe(false)
      expect(doc.text.value).toBe('// v1\n')

      doc.setText('// v2\n')
      expect(isDocumentDirty(doc)).toBe(true)
      expect(doc.canUndo.value).toBe(true)

      expect(doc.undo()).toBe(true)
      expect(doc.text.value).toBe('// v1\n')
      expect(isDocumentDirty(doc)).toBe(false)

      doc.setText('// v3\n')
      doc.markSaved()
      expect(isDocumentDirty(doc)).toBe(false)
    })

    it('reset clears history and state', () => {
      const docs = createPageDocuments()
      const doc = docs['script.js']
      doc.loadFromText('x\n')
      doc.setText('y\n')
      doc.reset()
      expect(doc.model.value).toBeNull()
      expect(doc.loadState.value).toBe('idle')
      expect(doc.canUndo.value).toBe(false)
    })
  })

  describe('RuleDocument', () => {
    it('parses rule array, supports setText/undo/redo', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']

      doc.loadFromText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
      expect(doc.model.value).not.toBeNull()
      expect(isDocumentDirty(doc)).toBe(false)

      doc.setText(`${JSON.stringify([{ type: 'el-button' }], null, 2)}\n`)
      const current = doc.model.value!.toJSON()
      expect((current.children?.[0] as { type?: string }).type).toBe('el-button')
      expect(isDocumentDirty(doc)).toBe(true)

      expect(doc.undo()).toBe(true)
      const undone = doc.model.value!.toJSON()
      expect((undone.children?.[0] as { type?: string }).type).toBe('div')
    })

    it('captures parseError for invalid JSON without throwing', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']
      doc.loadFromText('not-json')
      expect(doc.parseError.value).not.toBeNull()
    })

    it('replaceModel adopts an externally provided tree', () => {
      const docs = createPageDocuments()
      const ruleA = docs['rule.json']
      ruleA.loadFromText(`${JSON.stringify([{ type: 'span' }], null, 2)}\n`)
      const externalTree = ruleA.model.value!

      const docs2 = createPageDocuments()
      docs2['rule.json'].replaceModel(externalTree)
      expect(docs2['rule.json'].model.value).toBe(externalTree)
      expect(docs2['rule.json'].loadState.value).toBe('loaded')
    })
  })

  describe('PageDataDocument', () => {
    it('parses pagedata text into a DataSetCrudTool and exposes text round-trip', () => {
      const docs = createPageDocuments()
      const doc = docs['pagedata.json']

      doc.loadFromText(makePageDataText('Alpha'))
      expect(doc.model.value).not.toBeNull()
      expect(doc.text.value).toContain('Items')
      expect(isDocumentDirty(doc)).toBe(false)

      doc.setText(makePageDataText('Beta'))
      expect(doc.text.value).toContain('Beta')
      expect(isDocumentDirty(doc)).toBe(true)
    })

    it('mutate commits to history and is undoable', () => {
      const docs = createPageDocuments()
      const doc = docs['pagedata.json']
      doc.loadFromText(makePageDataText('Alpha'))

      const ok = doc.mutate((tool) => {
        tool.createColumn({ tableName: 'Items', column: { name: 'note', type: 'string' } })
      })
      expect(ok).toBe(true)
      expect(doc.text.value).toContain('note')
      expect(doc.canUndo.value).toBe(true)
      expect(doc.undo()).toBe(true)
      expect(doc.text.value).not.toContain('"name": "note"')
    })

    it('empty payload leaves document in a clean loaded state', () => {
      const docs = createPageDocuments()
      const doc = docs['pagedata.json']
      doc.loadFromText('')
      expect(doc.model.value).toBeNull()
      expect(doc.loadState.value).toBe('loaded')
      expect(isDocumentDirty(doc)).toBe(false)
    })
  })
})
