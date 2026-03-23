/**
 * VCM → Catalog Sync Script
 *
 * Reads temp-vcm-raw-dump.json (VCM truth) and updates
 * packages/spark-ai/src/component-props-catalog.ts (catalog).
 *
 * Strategy:
 * - props:  REPLACE with VCM data (the main goal)
 * - emits:  REPLACE with VCM data
 * - slots:  KEEP existing catalog slots if they have schema; otherwise use VCM
 * - capabilities, notes, rootFields, description, category: KEEP (hand-written)
 * - source: update based on whether hand-written metadata exists
 */
const fs = require('fs')
const path = require('path')

// ── 1. Read inputs ──
const vcmDump = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'temp-vcm-raw-dump.json'), 'utf8')
)
const catalogPath = path.join(
  __dirname, 'packages/spark-ai/src/component-props-catalog.ts'
)
const catalogSrc = fs.readFileSync(catalogPath, 'utf8')

// ── 2. Extract COMPONENT_CATALOG JSON from TS ──
const jsonStartMarker = 'export const COMPONENT_CATALOG: ComponentCatalog = '
const jsonStartIdx = catalogSrc.indexOf(jsonStartMarker)
if (jsonStartIdx === -1) throw new Error('Cannot find COMPONENT_CATALOG in TS file')

const objStartIdx = jsonStartIdx + jsonStartMarker.length // points to '{'

// Find the matching closing brace by counting
let depth = 0, objEndIdx = -1
for (let i = objStartIdx; i < catalogSrc.length; i++) {
  const ch = catalogSrc[i]
  if (ch === '{') depth++
  else if (ch === '}') {
    depth--
    if (depth === 0) { objEndIdx = i + 1; break }
  }
}
if (objEndIdx === -1) throw new Error('Cannot find matching } for COMPONENT_CATALOG')

const catalogJson = catalogSrc.slice(objStartIdx, objEndIdx)
const catalog = JSON.parse(catalogJson)

// ── 3. Build VCM key → catalog key map ──
function vcmKeyToCatalogKey(vcmKey) {
  // vcmKey: "packages\\spark-component\\src\\renderer\\containers\\renderer-table"
  // Extract last segment
  const seg = vcmKey.split(/[/\\]/).pop()

  // container mappings: renderer-xxx → r-xxx
  if (seg.startsWith('renderer-')) {
    return 'r-' + seg.slice('renderer-'.length)
  }
  // field mappings: field-xxx → r-xxx
  if (seg.startsWith('field-')) {
    const sub = seg.slice('field-'.length)
    // field-column-group → r-column-group (group, not field)
    // field-context-renderer → r-context-renderer
    return 'r-' + sub
  }
  return seg
}

// ── 4. Convert VCM prop → catalog PropEntry ──
function convertProp(vcmProp) {
  const entry = {
    name: vcmProp.name,
    type: vcmProp.type,
    required: vcmProp.required
  }
  if (vcmProp.default !== undefined) entry.default = vcmProp.default
  if (vcmProp.description) entry.description = vcmProp.description

  // Convert schema
  if (vcmProp.schemaKind === 'enum' && vcmProp.schemaVariantSamples) {
    entry.schema = {
      kind: 'enum',
      type: vcmProp.schemaType || vcmProp.type,
      variants: vcmProp.schemaVariantSamples
    }
  }
  // For 'object' and 'array' schemas, we don't have full details in raw dump
  // so we skip them (the prop.type string already conveys the info)

  return entry
}

// ── 5. Convert VCM emit → catalog EmitEntry ──
function convertEmit(vcmEmit) {
  const entry = { name: vcmEmit.name }
  if (vcmEmit.type) entry.type = vcmEmit.type
  return entry
}

// ── 6. Convert VCM slot → catalog SlotEntry ──
function convertSlot(vcmSlot) {
  const entry = { name: vcmSlot.name }
  if (vcmSlot.type) entry.type = vcmSlot.type
  return entry
}

// ── 7. Determine if an entry has hand-written metadata ──
function hasAddendum(entry) {
  return !!(entry.notes || entry.rootFields || 
    (entry.capabilities && 
     (entry.capabilities.consumes?.length || entry.capabilities.provides?.length)))
}

// ── 8. Process each VCM component ──
const components = catalog.components
const stats = { updated: 0, added: 0, skipped: 0, details: [] }

for (const [vcmKey, vcmData] of Object.entries(vcmDump)) {
  const catalogKey = vcmKeyToCatalogKey(vcmKey)

  // Skip config-only scope props (config is injected, not a user-facing prop)
  // But keep it for scope components where config IS a prop
  const vcmProps = vcmData.props || []
  const vcmEmits = vcmData.events || []
  const vcmSlots = vcmData.slots || []

  if (components[catalogKey]) {
    // ── UPDATE existing entry ──
    const entry = components[catalogKey]
    const oldPropsCount = entry.props?.length || 0
    const oldEmitsCount = entry.emits?.length || 0

    // Replace props
    entry.props = vcmProps.map(convertProp)

    // Replace emits
    entry.emits = vcmEmits.map(convertEmit)

    // Slots: keep existing if they have schema, otherwise use VCM
    if (vcmSlots.length > 0) {
      const existingHasSchema = (entry.slots || []).some(s => s.schema)
      if (!existingHasSchema) {
        entry.slots = vcmSlots.map(convertSlot)
      }
      // else keep existing richer slots
    }

    // Update source
    const oldSource = entry.source
    entry.source = hasAddendum(entry) ? 'vcm+addendum' : 'vcm'

    stats.updated++
    stats.details.push(
      `  UPDATE ${catalogKey}: props ${oldPropsCount}→${entry.props.length}, ` +
      `emits ${oldEmitsCount}→${entry.emits.length}, ` + 
      `source ${oldSource}→${entry.source}`
    )
  } else {
    // ── ADD new entry ──
    const isContainer = vcmKey.includes('containers')
    const isField = vcmKey.includes('fields')

    const newEntry = {
      type: catalogKey,
      category: isContainer ? 'container' : (isField ? 'field' : 'unknown'),
      description: `SPARK ${isContainer ? '容器' : '字段'}组件，可在 rule.json 中通过 type="${catalogKey}" 使用。`,
      props: vcmProps.map(convertProp),
      emits: vcmEmits.map(convertEmit),
      capabilities: { consumes: [], provides: [] },
      source: 'vcm'
    }

    if (vcmSlots.length > 0) {
      newEntry.slots = vcmSlots.map(convertSlot)
    }

    components[catalogKey] = newEntry

    stats.added++
    stats.details.push(
      `  ADD    ${catalogKey}: props ${newEntry.props.length}, emits ${newEntry.emits.length}`
    )

    // Also add to registry
    if (isContainer && !catalog.registry.containers.includes(catalogKey)) {
      catalog.registry.containers.push(catalogKey)
      catalog.registry.containers.sort()
    }
    if (isField && !catalog.registry.fields.includes(catalogKey)) {
      // r-column-group goes to 'groups', r-context-renderer goes to 'fields'
      if (catalogKey === 'r-column-group') {
        if (!catalog.registry.groups.includes(catalogKey)) {
          catalog.registry.groups.push(catalogKey)
        }
      } else {
        catalog.registry.fields.push(catalogKey)
        catalog.registry.fields.sort()
      }
    }
  }
}

// ── 9. Update metadata ──
catalog.buildTime = new Date().toISOString()
catalog.componentCount = Object.keys(components).length

// ── 10. Serialize and write back ──
const newJson = JSON.stringify(catalog, null, 2)

const newSrc =
  catalogSrc.slice(0, objStartIdx) +
  newJson +
  catalogSrc.slice(objEndIdx)

fs.writeFileSync(catalogPath, newSrc, 'utf8')

// ── 11. Report ──
console.log('=== VCM → Catalog Sync Report ===')
console.log(`Updated: ${stats.updated}`)
console.log(`Added:   ${stats.added}`)
console.log(`Skipped: ${stats.skipped}`)
console.log('')
console.log('Details:')
stats.details.forEach(d => console.log(d))
console.log('')
console.log(`Catalog written to: ${catalogPath}`)
console.log(`Total components: ${catalog.componentCount}`)
