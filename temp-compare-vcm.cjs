const fs = require('fs');
const src = fs.readFileSync('packages/spark-ai/src/component-props-catalog.ts', 'utf8');

const lines = src.split('\n');
const catalog = {};
let curType = null;
let propNames = [];
let emitNames = [];
let inProps = false, inEmits = false;

for (const line of lines) {
  const tm = line.match(/^\s*"type":\s*"(r-[\w-]+)"/);
  if (tm) {
    if (curType) catalog[curType] = { props: propNames.length, emits: emitNames.length, propNames: [...propNames], emitNames: [...emitNames] };
    curType = tm[1];
    propNames = []; emitNames = [];
    inProps = false; inEmits = false;
    continue;
  }
  if (/^\s*"props":\s*\[/.test(line)) { inProps = true; inEmits = false; continue; }
  if (/^\s*"emits":\s*\[/.test(line)) { inEmits = true; inProps = false; continue; }
  if (inProps) {
    const pm = line.match(/^\s*"name":\s*"(\w+)"/);
    if (pm) propNames.push(pm[1]);
  }
  if (inEmits) {
    const em = line.match(/^\s*"name":\s*"([\w-]+)"/);
    if (em) emitNames.push(em[1]);
  }
}
if (curType) catalog[curType] = { props: propNames.length, emits: emitNames.length, propNames: [...propNames], emitNames: [...emitNames] };

// VCM dump
const vcm = require('./temp-vcm-raw-dump.json');
const vcmNorm = {};
for (const [k, v] of Object.entries(vcm)) {
  const base = k.split(/[\\/]/).pop();
  const rType = base.replace(/^renderer-/, 'r-').replace(/^field-/, 'r-');
  vcmNorm[rType] = v;
}

const allTypes = new Set([...Object.keys(catalog), ...Object.keys(vcmNorm)]);
const sorted = [...allTypes].sort();

console.log('Component'.padEnd(28) + 'Catalog'.padEnd(10) + 'VCM'.padEnd(10) + 'Diff');
console.log('-'.repeat(75));

let diffs = [];
for (const t of sorted) {
  const c = catalog[t];
  const v = vcmNorm[t];
  const cp = c ? c.props : '-';
  const vp = v ? v.propsCount : '-';
  let diff = '';
  if (!c) diff = '⚠ MISSING in catalog';
  else if (!v) diff = '⚠ MISSING in VCM';
  else if (c.props !== v.propsCount) diff = '△ props: ' + c.props + ' → ' + v.propsCount;
  else diff = '✓';
  console.log(t.padEnd(28) + String(cp).padEnd(10) + String(vp).padEnd(10) + diff);

  if (c && v && c.props !== v.propsCount) {
    const vcmPropNames = v.props.map(p => p.name);
    const added = vcmPropNames.filter(n => !c.propNames.includes(n));
    const removed = c.propNames.filter(n => !vcmPropNames.includes(n));
    diffs.push({ type: t, catalogProps: c.propNames, vcmProps: vcmPropNames, added, removed });
  }
}

if (diffs.length) {
  console.log('\n=== PROP DIFFERENCE DETAILS ===');
  for (const d of diffs) {
    console.log('\n' + d.type + ':');
    if (d.added.length) console.log('  + VCM new:     ' + d.added.join(', '));
    if (d.removed.length) console.log('  - Catalog only: ' + d.removed.join(', '));
  }
}
