const fs = require('fs')

const BIB_PATH = 'docs\\MindVector\\bib.json'
const OUT_PATH = 'docs\\MindVector\\scoring-config.template.json'

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function addKey(out, key) {
  if (!key || typeof key !== 'string') return
  const trimmed = key.trim()
  if (!trimmed) return
  out.add(trimmed)
}

function collectRequiredKeys(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectRequiredKeys(item, out)
    return
  }
  if (!isPlainObject(node)) return

  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith('KeyRequired') && typeof v === 'string') {
      addKey(out, v)
      continue
    }

    // parametersRequired: values should be strings (config keys)
    if (k === 'parametersRequired' && isPlainObject(v)) {
      for (const val of Object.values(v)) {
        if (typeof val === 'string') addKey(out, val)
      }
      // 仍递归以捕捉 parametersRequired 内可能的 *KeyRequired（尽管不推荐）
      collectRequiredKeys(v, out)
      continue
    }

    collectRequiredKeys(v, out)
  }
}

function setDeep(target, dottedKey, value) {
  const parts = dottedKey.split('.').filter(Boolean)
  if (!parts.length) return
  let cur = target
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const isLeaf = i === parts.length - 1
    if (isLeaf) {
      if (cur[part] === undefined) cur[part] = value
    } else {
      if (!isPlainObject(cur[part])) cur[part] = {}
      cur = cur[part]
    }
  }
}

function guessPlaceholder(key) {
  const leaf = key.split('.').pop() || ''
  if (leaf === 'items' || leaf === 'reverseItems') return []
  if (leaf === 'subscales') return {}
  if (leaf === 'thresholds') return {}
  if (leaf === 'lotteries') return []
  if (leaf.endsWith('Scale') || leaf.endsWith('scale')) return {}
  if (leaf.includes('Coding') || leaf.includes('coding')) return {}
  if (leaf.includes('Model') || leaf.includes('model')) return {}
  return null
}

function flattenKeys(keys) {
  return [...keys].sort((a, b) => a.localeCompare(b))
}

function main() {
  const root = JSON.parse(fs.readFileSync(BIB_PATH, 'utf8'))
  if (!Array.isArray(root.tasks)) throw new Error('root.tasks missing or not an array')

  const keys = new Set()
  for (const task of root.tasks) {
    collectRequiredKeys(task?.scoringSpec, keys)
  }

  const template = {
    _meta: {
      generatedAt: new Date().toISOString(),
      source: BIB_PATH.replace(/\\/g, '/'),
      note: 'Fill these values from norms/thresholds/answer keys/models. Dots denote nesting.',
    },
    config: {},
  }

  for (const key of flattenKeys(keys)) {
    setDeep(template.config, key, guessPlaceholder(key))
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(template, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${OUT_PATH} with ${keys.size} keys.`)
}

main()
