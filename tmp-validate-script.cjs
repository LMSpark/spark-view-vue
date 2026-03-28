const fs = require('fs');
const gen = fs.readFileSync('./tmp-generated-script-v1.js', 'utf-8');
const err = [];

// 1. Required function names
const required = [
  'applyTreeFilters','resetTreeFilters','focusCurrentNode','handleAddRootNode',
  'reloadTreeFromServer','handleAddChildNode','handleEditTreeNode','handleDeleteTreeNode',
  'saveCurrentNode','showCurrentNodeInfo','clearActionLogs','__init__','bindTreeView',
  'getView','getTreeApi','getNodeEditorApi','waitForApi','cloneJson','isCrudResult',
  'ensureCrudSuccess','nowText','readRows','walkTree','flattenNodeCount','findFirstNode',
  'computeMeta','syncPageMeta','pushActionLog','readFilters','setFilters','hasActiveFilters',
  'nodeMatchesFilters','filterTreeRows','captureMasterRows','getTreeView','getCurrentNode','slugifyTitle'
];

for (const fn of required) {
  const pat = 'function ' + fn + '(';
  const pat2 = 'function ' + fn + ' (';
  if (!gen.includes(pat) && !gen.includes(pat2)) err.push('missing function: ' + fn);
}

// 2. _pageState fields
const stateFields = ['initialized','suppressRowsSnapshot','filterActive','masterRows','lastTreeLoadError','loadFailureNotified'];
for (const f of stateFields) { if (!gen.includes(f)) err.push('_pageState missing: ' + f); }

// 3. Key API patterns
const apis = ['getApi(','showPrompt','showConfirm','showMessage','addRow','editRowById',
  'removeRow','replaceRows','refresh()','rowsChanged','currentRowChanged','requestStateChanged',
  'expandToNode','validate','getFormData','events.on'];
for (const a of apis) { if (!gen.includes(a)) err.push('missing API: ' + a); }

// 4. CRUD defaults
if (!gen.includes("'module'")) err.push('root node default module');
if (!gen.includes('ActionLogs')) err.push('no ActionLogs access');

// 5. __init__ structure
const initIdx = gen.lastIndexOf('function __init__');
if (initIdx < 0) err.push('no __init__');
else {
  const initBody = gen.substring(initIdx);
  if (!initBody.includes('bindTreeView')) err.push('__init__ missing bindTreeView');
  if (!initBody.includes('waitForApi')) err.push('__init__ missing waitForApi');
}

// 6. Safety: No import/export
if (/^import /m.test(gen)) err.push('contains import');
if (/^export /m.test(gen)) err.push('contains export');

// 7. Log truncation
if (!gen.includes('30')) err.push('no log truncation to 30');

// 8. Sandbox compliance
if (gen.includes('window.')) err.push('uses window.');
if (gen.includes('document.')) err.push('uses document. directly');

// 9. requestStateChanged state codes
if (!gen.includes('=== 2') && !gen.includes('== 2')) err.push('no state===2 check');
if (!gen.includes('=== 3') && !gen.includes('== 3')) err.push('no state===3 check');
if (!gen.includes('=== 4') && !gen.includes('== 4')) err.push('no state===4 check');

// 10. Correct DataView table names
const tableNames = ['PageMeta','EditorFilters','NavigationNodes','ActionLogs'];
for (const tn of tableNames) {
  if (!gen.includes("'" + tn + "'") && !gen.includes('"' + tn + '"')) err.push('missing table ref: ' + tn);
}

if (err.length === 0) console.log('SCRIPT V1 ALL CHECKS PASSED ✅');
else { console.log('SCRIPT V1 (' + err.length + ' issues):'); err.forEach(e => console.log('  ❌', e)); }
