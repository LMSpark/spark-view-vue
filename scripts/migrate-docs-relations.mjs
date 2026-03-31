/**
 * Migrate docs/ markdown files: "relations" → "tableRelations"
 * Also strips parentViewId / childViewId from JSON blocks.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { globSync } from 'glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const files = globSync('docs/**/*.md', { cwd: root }).map(f => path.join(root, f))
let totalChanges = 0

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  const original = content

  // Skip RELATION_REFACTOR.md - it documents the migration itself
  if (file.includes('RELATION_REFACTOR.md')) {
    content = content.replace(
      '| `relations: [...]`（旧格式） | 构造函数自动拆分转换为 tableRelations + viewDependencies |',
      '| `relations: [...]`（旧格式） | **已移除** — 必须使用 `tableRelations` + `viewDependencies` |'
    )
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8')
      console.log('UPDATED (compat note): ' + path.relative(root, file))
      totalChanges++
    }
    continue
  }

  // 1. JSON key: "relations": [ → "tableRelations": [
  content = content.replace(/"relations":\s*\[/g, '"tableRelations": [')

  // 2. JS/TS property: relations: [ → tableRelations: [  (but not tableRelations: [)
  content = content.replace(/(?<!table)relations:\s*\[/g, 'tableRelations: [')

  // 3. Text references
  content = content.replace(/pagedata\.relations/g, 'pagedata.tableRelations')
  content = content.replace(/relations 映射到 DataRelation/g, 'tableRelations 映射到 TableRelation')

  // 4. Java code references
  content = content.replace(/relations\.isEmpty\(\)/g, 'tableRelations.isEmpty()')
  content = content.replace(/pageData\.put\("relations"/g, 'pageData.put("tableRelations"')

  // 5. Strip parentViewId / childViewId from JSON blocks
  content = content.replace(/\s*"parentViewId":\s*"[^"]*",?\s*\n/g, '\n')
  content = content.replace(/\s*"childViewId":\s*"[^"]*",?\s*\n/g, '\n')

  // 6. Comment: // 父子级联
  content = content.replace(/\/\/ 父子级联(?!\（)/g, '// 父子级联（tableRelations）')

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8')
    console.log('UPDATED: ' + path.relative(root, file))
    totalChanges++
  }
}

console.log(`\nTotal files updated: ${totalChanges}`)
