#!/usr/bin/env node
/**
 * Migrate rule.json files from old dock model to dock-as-children model.
 *
 * Old model:
 *   parent.props.docks = { toolbar: { position: 'top' } }
 *   child.dock = 'toolbar'
 *
 * New model:
 *   { type: 'r-toolbar', props: { position: 'top' }, children: [child] }
 *
 * Usage: node scripts/migrate-dock-to-children.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')

// All known dock types
const DOCK_TYPES = new Set([
  'toolbar', 'actions', 'filter', 'editor', 'header', 'footer', 'tail',
])

function findRuleFiles() {
  // Moved to main()
}

/**
 * Recursively transform a JSON node tree.
 * Returns { node, changed } where changed indicates if any migration happened.
 */
function migrateNode(node) {
  if (node === null || node === undefined || typeof node !== 'object') {
    return { node, changed: false }
  }

  if (Array.isArray(node)) {
    let anyChanged = false
    const result = node.map(item => {
      const r = migrateNode(item)
      if (r.changed) anyChanged = true
      return r.node
    })
    return { node: result, changed: anyChanged }
  }

  let changed = false

  // 1. Recursively migrate children first
  if (Array.isArray(node.children)) {
    const r = migrateNode(node.children)
    if (r.changed) {
      node.children = r.node
      changed = true
    }
  }

  // 2. Recursively migrate props.children if present (unlikely but safe)
  if (node.props && Array.isArray(node.props.children)) {
    const r = migrateNode(node.props.children)
    if (r.changed) {
      node.props.children = r.node
      changed = true
    }
  }

  // 3. Now handle dock migration on this node's children
  if (Array.isArray(node.children) && node.children.some(c => typeof c === 'object' && c !== null && c.dock)) {
    changed = true

    // Collect docks config from props.docks or root-level docks
    const docksConfig = node.props?.docks ?? node.docks ?? {}

    // Remove docks from props and root
    if (node.props?.docks !== undefined) {
      delete node.props.docks
      // Clean up empty props
      if (Object.keys(node.props).length === 0) delete node.props
    }
    if (node.docks !== undefined) {
      delete node.docks
    }

    // Group docked children by dock type, preserving insertion order
    // Non-docked children stay in place; docked children get collected into wrappers
    const dockGroups = new Map() // dockType → { children: [], firstIndex: number }
    const newChildren = []

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (typeof child === 'object' && child !== null && child.dock) {
        const dockType = child.dock
        // Remove dock property from child
        const migratedChild = { ...child }
        delete migratedChild.dock

        if (!dockGroups.has(dockType)) {
          // Place a placeholder at first occurrence position
          const wrapper = { __dockPlaceholder: dockType }
          dockGroups.set(dockType, { children: [], placeholder: wrapper })
          newChildren.push(wrapper)
        }
        dockGroups.get(dockType).children.push(migratedChild)
      } else {
        newChildren.push(child)
      }
    }

    // Replace placeholders with actual wrapper nodes
    node.children = newChildren.map(item => {
      if (item.__dockPlaceholder) {
        const dockType = item.__dockPlaceholder
        const group = dockGroups.get(dockType)
        const dockConfig = docksConfig[dockType]
        const wrapper = { type: `r-${dockType}` }
        if (dockConfig && Object.keys(dockConfig).length > 0) {
          wrapper.props = { ...dockConfig }
        }
        wrapper.children = group.children
        return wrapper
      }
      return item
    })
  }

  return { node, changed }
}

async function main() {
  const base = resolve(ROOT, 'spark-ai-server/data/pages-config')
  const files = []

  function walkSync(dir) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch { return }
    for (const e of entries) {
      const full = resolve(dir, e.name)
      if (e.isDirectory()) walkSync(full)
      else if (e.name === 'rule.json') files.push(full)
    }
  }
  walkSync(base)

  let totalMigrated = 0

  for (const file of files) {
    const raw = readFileSync(file, 'utf-8')
    // Quick check: does this file contain "dock"?
    if (!raw.includes('"dock"') && !raw.includes('"docks"')) continue

    let json
    try {
      json = JSON.parse(raw)
    } catch (e) {
      console.error(`  ❌ JSON parse error: ${file}`)
      continue
    }

    const { node, changed } = migrateNode(json)
    if (!changed) continue

    totalMigrated++
    const rel = relative(ROOT, file)
    console.log(`✅ ${rel}`)

    if (!DRY_RUN) {
      const output = JSON.stringify(node, null, 2) + '\n'
      writeFileSync(file, output, 'utf-8')
    } else {
      console.log('   (dry-run, not written)')
    }
  }

  console.log(`\nDone: ${totalMigrated} file(s) migrated${DRY_RUN ? ' (dry-run)' : ''}.`)
}

main().catch(e => { console.error(e); process.exit(1) })
