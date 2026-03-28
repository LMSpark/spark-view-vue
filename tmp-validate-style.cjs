const fs = require('fs')
const gen = fs.readFileSync('./tmp-generated-style-v1.css', 'utf-8')
const err = []

// 1. Scoping
if (!gen.includes('[data-page="tree-demo"]')) err.push('no data-page scope')

// 2. Required class names
const classes = [
  '.nav-editor-page', '.nav-editor-header', '.nav-editor-header__title',
  '.nav-editor-header__status', '.nav-editor-badge', '.nav-editor-toolbar-card',
  '.nav-editor-toolbar__actions', '.nav-editor-body', '.nav-editor-panel',
  '.nav-editor-panel--tree', '.nav-editor-panel__head', '.nav-editor-tree-shell',
]
for (const c of classes) {
  if (!gen.includes(c)) err.push('missing class: ' + c)
}

// 3. Responsive breakpoints
if (!gen.includes('1360px')) err.push('no 1360px breakpoint')
if (!gen.includes('768px')) err.push('no 768px breakpoint')

// 4. Key visual rules
if (!gen.includes('sticky')) err.push('no sticky positioning')
if (!gen.includes('scrollbar-gutter')) err.push('no scrollbar-gutter')
if (!gen.includes('#1f2f45')) err.push('no dark gradient color')
if (!gen.includes('16px')) err.push('no 16px border-radius')
if (!gen.includes('flex-direction: column')) err.push('no flex-direction column')
if (!gen.includes('calc(100vh')) err.push('no calc(100vh) max-height')

// 5. Element Plus component styling
if (!gen.includes('.el-tree')) err.push('no el-tree styles')
if (!gen.includes('.el-card')) err.push('no el-card styles')
if (!gen.includes('.renderer-tree-main')) err.push('no renderer-tree-main')

// 6. No SCSS/LESS features
if (gen.includes('@mixin')) err.push('SCSS mixin found')

// 7. Count selectors with data-page scoping
const scopedCount = (gen.match(/\[data-page="tree-demo"\]/g) || []).length
console.log(`  data-page scoped selectors: ${scopedCount}`)

// 8. Count @media queries
const mediaCount = (gen.match(/@media/g) || []).length
console.log(`  @media queries: ${mediaCount}`)

// 9. Total lines
const lines = gen.split('\n').length
console.log(`  total lines: ${lines}`)

if (err.length === 0) {
  console.log('STYLE V1 ALL CHECKS PASSED ✅')
} else {
  console.log(`STYLE V1 (${err.length} issues):`)
  err.forEach(e => console.log('  ❌', e))
}
