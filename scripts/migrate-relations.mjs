import fs from 'fs'
import path from 'path'

const baseDir = 'd:/SPARK_VIEW/spark-ai-server/data/pages-config'

function findPageDataFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...findPageDataFiles(fullPath))
    else if (entry.name === 'pagedata.json') results.push(fullPath)
  }
  return results
}

const files = findPageDataFiles(baseDir)
let migrated = 0
let skipped = 0

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')

  if (!raw.includes('"relations"')) { skipped++; continue }
  if (raw.includes('"tableRelations"')) { skipped++; continue }

  try {
    const obj = JSON.parse(raw)

    function migrateObj(o) {
      if (!o || typeof o !== 'object') return false
      let changed = false

      if ('relations' in o) {
        const rels = o.relations
        delete o.relations

        const tableRelations = []
        const viewDependencies = []

        if (Array.isArray(rels)) {
          for (const rel of rels) {
            const tr = {}
            if (rel.parentTable) tr.parentTable = rel.parentTable
            if (rel.childTable) tr.childTable = rel.childTable
            if (rel.parentField) tr.parentField = rel.parentField
            if (rel.childField) tr.childField = rel.childField
            if (rel.relationName) tr.relationName = rel.relationName
            if (rel.cascadeUpdate !== undefined) tr.cascadeUpdate = rel.cascadeUpdate
            if (rel.cascadeDelete !== undefined) tr.cascadeDelete = rel.cascadeDelete
            tableRelations.push(tr)

            const depType = rel.dependencyType || 'currentRow'
            const autoLoad = rel.autoLoad !== undefined ? rel.autoLoad : true
            if (depType !== 'currentRow' || autoLoad !== true) {
              const vd = { parentTable: rel.parentTable, childTable: rel.childTable }
              if (depType !== 'currentRow') vd.dependencyType = depType
              if (autoLoad !== true) vd.autoLoad = autoLoad
              viewDependencies.push(vd)
            }
          }
        }

        o.tableRelations = tableRelations
        if (viewDependencies.length > 0) {
          o.viewDependencies = viewDependencies
        }
        changed = true
      }

      for (const [k, v] of Object.entries(o)) {
        if (k !== 'tableRelations' && k !== 'viewDependencies' && typeof v === 'object' && v !== null) {
          if (migrateObj(v)) changed = true
        }
      }

      return changed
    }

    const changed = migrateObj(obj)
    if (changed) {
      fs.writeFileSync(file, JSON.stringify(obj, null, 4) + '\n', 'utf8')
      migrated++
      console.log('MIGRATED:', path.relative(baseDir, file))
    } else {
      skipped++
    }
  } catch (e) {
    console.error('ERROR:', file, '-', e.message)
  }
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${files.length} total`)
