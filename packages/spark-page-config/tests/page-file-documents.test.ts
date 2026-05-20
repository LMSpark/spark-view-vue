import { describe, expect, it } from 'vitest'
import { getSparkNodeChildren } from '@spark-view/spark-page-config/page/model'
import { createPageDocuments, isPageFileDocumentDirty } from '@spark-view/spark-page-config/page/workspace'

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
      expect(isPageFileDocumentDirty(doc)).toBe(false)
      expect(doc.canUndo.value).toBe(false)
      expect(doc.text.value).toBe('// v1\n')

      doc.setText('// v2\n')
      expect(isPageFileDocumentDirty(doc)).toBe(true)
      expect(doc.canUndo.value).toBe(true)

      expect(doc.undo()).toBe(true)
      expect(doc.text.value).toBe('// v1\n')
      expect(isPageFileDocumentDirty(doc)).toBe(false)

      doc.setText('// v3\n')
      doc.markSaved()
      expect(isPageFileDocumentDirty(doc)).toBe(false)
    })

    it('fails fast when calling mutate on text document', () => {
      const docs = createPageDocuments()
      const doc = docs['script.js']
      doc.loadFromText('// v1\n')

      expect(() => doc.mutate(() => {})).toThrow('script.js 不支持 mutate；请使用 setText')
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
      expect(isPageFileDocumentDirty(doc)).toBe(false)

      doc.setText(`${JSON.stringify([{ type: 'el-button' }], null, 2)}\n`)
      const current = doc.model.value!.toJSON()
      expect(getSparkNodeChildren(current.children)[0]?.type).toBe('el-button')
      expect(isPageFileDocumentDirty(doc)).toBe(true)

      expect(doc.undo()).toBe(true)
      const undone = doc.model.value!.toJSON()
      expect(getSparkNodeChildren(undone.children)[0]?.type).toBe('div')
    })

    it('captures parseError for invalid JSON without throwing', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']
      doc.loadFromText('not-json')
      expect(doc.parseError.value).not.toBeNull()
    })

    it('emits framework-neutral revision changes', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']
      let changes = 0
      const unsubscribe = doc.subscribe(() => { changes += 1 })

      doc.loadFromText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
      const firstRevision = doc.revision.value
      doc.setText(`${JSON.stringify([{ type: 'span' }], null, 2)}\n`)

      expect(changes).toBeGreaterThan(0)
      expect(doc.revision.value).toBeGreaterThan(firstRevision)
      unsubscribe()
    })

    it('accepts a single root SparkNode for page children', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']
      doc.loadFromText(JSON.stringify({ type: 'r-section', children: [] }))

      expect(doc.parseError.value).toBeNull()
      const root = doc.model.value!.toJSON()
      expect(root.type).toBe('spark-page')
      expect(root.id).toBe('spark-page-root')
      expect(getSparkNodeChildren(root.children)[0]?.type).toBe('r-section')
      expect(JSON.parse(doc.text.value)).toMatchObject({ type: 'r-section' })
    })

    it('uses SparkNodeTree.fromJson to fill missing ids for edit addressing', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']

      doc.loadFromText(`${JSON.stringify([
        {
          type: 'r-section',
          children: [
            { type: 'r-text', props: { field: 'name' } },
          ],
        },
      ], null, 2)}\n`)

      expect(doc.parseError.value).toBeNull()
      const root = doc.model.value!.toJSON()
      const section = getSparkNodeChildren(root.children)[0]
      const text = getSparkNodeChildren(section?.children)[0]
      expect(root.id).toBe('spark-page-root')
      expect(section?.id).toBe('r-section__0_0')
      expect(text?.id).toBe('r-text__0_0_0')
    })

    it('promotes legacy props.id when loading rule text', () => {
      const docs = createPageDocuments()
      const doc = docs['rule.json']

      doc.loadFromText(`${JSON.stringify([
        { type: 'r-section', props: { id: 'legacy-section', title: '假期管理' } },
      ], null, 2)}\n`)

      expect(doc.parseError.value).toBeNull()
      const section = getSparkNodeChildren(doc.model.value!.toJSON().children)[0]
      expect(section?.id).toBe('legacy-section')
      expect(section?.props).toEqual({ title: '假期管理' })
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
      expect(isPageFileDocumentDirty(doc)).toBe(false)

      doc.setText(makePageDataText('Beta'))
      expect(doc.text.value).toContain('Beta')
      expect(isPageFileDocumentDirty(doc)).toBe(true)
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
      expect(isPageFileDocumentDirty(doc)).toBe(false)
    })
  })
})
