// 凭证管理页面脚本

var _pageState = {
  entrySourceRows: null,
  entrySyncRegistered: false,
  suppressEntrySync: false,
}

function mustGetDataSet() {
  if (!$dataSet) {
    throw new Error('页面数据集尚未就绪')
  }
  return $dataSet
}

function mustGetView(tableName, viewId) {
  var resolvedViewId = viewId || 'default'
  var view = mustGetDataSet().getView(tableName, resolvedViewId)
  if (!view) {
    throw new Error('视图不存在: ' + tableName + '@' + resolvedViewId)
  }
  return view
}

function getViewRows(view) {
  return view && Array.isArray(view.rows) ? view.rows : []
}

function getRowId(row) {
  if (!row) return null
  var id = row.id
  if (typeof id === 'number' || typeof id === 'string') return id
  return null
}

function findRowById(view, id) {
  var rows = getViewRows(view)
  for (var i = 0; i < rows.length; i += 1) {
    var rowId = getRowId(rows[i])
    if (rowId === id || String(rowId) === String(id)) {
      return rows[i]
    }
  }
  return null
}

function getSelectedRowIds(view) {
  var rows = view && Array.isArray(view.selectedRows) ? view.selectedRows : []
  return rows
    .map(function(row) { return getRowId(row) })
    .filter(function(id) { return id !== null })
}

function nextNumericId(view) {
  var rows = getViewRows(view)
  var maxId = 0
  for (var i = 0; i < rows.length; i += 1) {
    var rawId = rows[i] ? rows[i].id : null
    var numericId = typeof rawId === 'number' ? rawId : Number(rawId)
    if (!Number.isFinite(numericId)) continue
    if (numericId > maxId) maxId = numericId
  }
  return maxId + 1
}

function appendLocalRow(view, data) {
  var row = Object.assign({}, data)
  if (getRowId(row) === null) {
    row.id = nextNumericId(view)
  }
  view.appendRow(row)
  return row
}

function ensureSequentialIds(view) {
  var rows = getViewRows(view)
  if (rows.length === 0) return

  var nextId = 1
  var changed = false
  var normalizedRows = []

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i]
    var rawId = getRowId(row)
    if (rawId === null) {
      normalizedRows.push(Object.assign({}, row, { id: nextId }))
      changed = true
      nextId += 1
      continue
    }

    var numericId = typeof rawId === 'number' ? rawId : Number(rawId)
    if (Number.isFinite(numericId) && numericId >= nextId) {
      nextId = numericId + 1
    }
    normalizedRows.push(row)
  }

  if (changed) {
    view.replaceRows(normalizedRows)
  }
}

function isUserVoucher(row) {
  return !!row && row.isSystem !== true
}

function syncVoucherSelection(rowId) {
  var viewIds = ['default', 'all', 'draft', 'audited']
  for (var i = 0; i < viewIds.length; i += 1) {
    var view = mustGetView('Voucher', viewIds[i])
    if (rowId === null || rowId === undefined) {
      view.setCurrentRow(null)
      continue
    }
    if (!findRowById(view, rowId)) {
      view.setCurrentRow(null)
      continue
    }
    if (!view.setCurrentRowById(rowId)) {
      view.setCurrentRow(null)
    }
  }
}

function syncVoucherViews() {
  var defaultView = mustGetView('Voucher', 'default')
  var allView = mustGetView('Voucher', 'all')
  var draftView = mustGetView('Voucher', 'draft')
  var auditedView = mustGetView('Voucher', 'audited')
  var sourceRows = getViewRows(defaultView).filter(isUserVoucher)

  allView.replaceRows(sourceRows.slice())
  draftView.replaceRows(sourceRows.filter(function(row) {
    return row.status === '草稿'
  }))
  auditedView.replaceRows(sourceRows.filter(function(row) {
    return row.status === '已审核'
  }))

  var currentRow = defaultView.currentRow
  syncVoucherSelection(currentRow ? currentRow.id : null)
}

function normalizeStaticRows() {
  ensureSequentialIds(mustGetView('Voucher', 'default'))
  ensureSequentialIds(mustGetView('Entries', 'default'))
  syncVoucherViews()
}

function getDrawerApi() {
  return $components && typeof $components.getApi === 'function'
    ? $components.getApi('drawer__voucherEntry')
    : null
}

function cloneRows(rows) {
  return rows.map(function(row) {
    return Object.assign({}, row)
  })
}

function getCurrentVoucherId() {
  var currentRow = mustGetView('Voucher', 'default').currentRow
  return currentRow && currentRow.id !== undefined ? currentRow.id : null
}

function getEntriesTable() {
  var tables = mustGetDataSet().tables
  if (!tables || !tables.Entries) {
    throw new Error('Entries 表不存在')
  }
  return tables.Entries
}

function ensureEntrySourceRows() {
  if (_pageState.entrySourceRows !== null) {
    return _pageState.entrySourceRows
  }

  var tableRows = getEntriesTable().rows
  if (Array.isArray(tableRows) && tableRows.length > 0) {
    _pageState.entrySourceRows = cloneRows(tableRows)
  } else {
    _pageState.entrySourceRows = cloneRows(getViewRows(mustGetView('Entries', 'default')))
  }
  return _pageState.entrySourceRows
}

function writeEntrySourceRows(rows) {
  var nextRows = cloneRows(rows)
  _pageState.entrySourceRows = nextRows
  getEntriesTable().rows = cloneRows(nextRows)
}

function syncEntriesForCurrentVoucher() {
  var entriesView = mustGetView('Entries', 'default')
  var voucherId = getCurrentVoucherId()
  var sourceRows = ensureEntrySourceRows()
  var visibleRows = voucherId === null
    ? []
    : sourceRows.filter(function(row) {
        return row.voucherId === voucherId
      })

  _pageState.suppressEntrySync = true
  entriesView.replaceRows(visibleRows)
  _pageState.suppressEntrySync = false
}

function flushEntriesViewToSource() {
  if (_pageState.suppressEntrySync) return

  var voucherId = getCurrentVoucherId()
  if (voucherId === null) return

  var entriesView = mustGetView('Entries', 'default')
  var retainedRows = ensureEntrySourceRows().filter(function(row) {
    return row.voucherId !== voucherId
  })
  var currentRows = cloneRows(getViewRows(entriesView)).map(function(row) {
    return Object.assign({}, row, { voucherId: voucherId })
  })

  writeEntrySourceRows(retainedRows.concat(currentRows))
}

function registerEntrySync() {
  if (_pageState.entrySyncRegistered) return
  mustGetView('Entries', 'default').events.on('rowsChanged', flushEntriesViewToSource)
  _pageState.entrySyncRegistered = true
}

function setVoucherDrawerVisible(visible) {
  var drawerApi = getDrawerApi()
  if (!drawerApi) {
    throw new Error('drawer__voucherEntry 组件 API 不可用')
  }
  if (visible) {
    if (typeof drawerApi.open !== 'function') {
      throw new Error('drawer__voucherEntry 缺少 open()')
    }
    drawerApi.open()
    return
  }
  if (typeof drawerApi.close !== 'function') {
    throw new Error('drawer__voucherEntry 缺少 close()')
  }
  drawerApi.close()
}

function buildNextVoucherNo(view) {
  var rows = getViewRows(view)
  var maxNumber = 0
  for (var i = 0; i < rows.length; i += 1) {
    var voucherNo = rows[i] && typeof rows[i].voucherNo === 'string' ? rows[i].voucherNo : ''
    var match = voucherNo.match(/(\d+)$/)
    if (!match) continue
    var current = Number(match[1])
    if (Number.isFinite(current) && current > maxNumber) {
      maxNumber = current
    }
  }
  return '记-' + String(maxNumber + 1).padStart(3, '0')
}

function createCompatView(tableName, viewId) {
  var nativeView = mustGetView(tableName, viewId)
  return {
    getAll: function() {
      return getViewRows(nativeView)
    },
    getCurrentRow: function() {
      return nativeView.currentRow || null
    },
    setCurrentRow: function(id) {
      if (id === null || id === undefined) {
        nativeView.setCurrentRow(null)
        return true
      }
      return nativeView.setCurrentRowById(id)
    },
    create: function(data) {
      return appendLocalRow(nativeView, data)
    },
    update: function(id, data) {
      return nativeView.updateRowById(id, data)
    },
    delete: function(id) {
      return nativeView.deleteRowById(id)
    },
    getSelectedRowIds: function() {
      return getSelectedRowIds(nativeView)
    },
    getById: function(id) {
      return findRowById(nativeView, id)
    },
    replaceRows: function(rows) {
      nativeView.replaceRows(rows)
    }
  }
}

function getLegacyPageDataSet() {
  mustGetDataSet()
  return {
    tables: {
      Voucher: {
        views: {
          default: createCompatView('Voucher', 'default'),
          all: createCompatView('Voucher', 'all'),
          draft: createCompatView('Voucher', 'draft'),
          audited: createCompatView('Voucher', 'audited')
        }
      },
      Entries: {
        views: {
          default: createCompatView('Entries', 'default')
        }
      }
    }
  }
}

var PageEngine = {
  setProps: function(componentId, props) {
    if (componentId !== 'drawer__voucherEntry') {
      throw new Error('当前页面仅支持设置 drawer__voucherEntry')
    }
    if (!props || typeof props.value !== 'boolean') {
      throw new Error('drawer__voucherEntry.setProps 仅支持布尔型 value')
    }
    setVoucherDrawerVisible(props.value)
  }
}

function __init__() {
  console.log('凭证管理页面已加载')
  normalizeStaticRows()
  registerEntrySync()
  
  // 自动选中第一行非系统凭证（如果有）
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var all = voucherView.getAll()
  if (all && all.length > 0) {
    // 优先选中非系统凭证
    var firstUserRow = null
    for (var i = 0; i < all.length; i++) {
      if (!all[i].isSystem) {
        firstUserRow = all[i]
        break
      }
    }
    if (firstUserRow) {
      voucherView.setCurrentRow(firstUserRow.id)
      syncVoucherSelection(firstUserRow.id)
      syncEntriesForCurrentVoucher()
    } else {
      voucherView.setCurrentRow(all[0].id)
      syncVoucherSelection(all[0].id)
      syncEntriesForCurrentVoucher()
    }
  } else {
    syncEntriesForCurrentVoucher()
  }
}

// ========== 凭证列表标签切换 ==========

// 标签切换时，同步当前行到新标签下的表格
function onVoucherTabChange(tabName) {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var currentRow = voucherView.getCurrentRow()
  if (currentRow && currentRow.id !== undefined) {
    syncVoucherSelection(currentRow.id)
  }
  syncEntriesForCurrentVoucher()
  
  // 切换标签后，如果 default 视图有当前行，框架会自动同步到各视图
  console.log('凭证列表标签切换:', tabName)
}

// ========== 凭证列表联动 ==========

// 凭证列表当前行变化时，自动刷新分录表格
function onVoucherChange(row) {
  if (row && row.id !== undefined) {
    syncVoucherSelection(row.id)
  }
  syncEntriesForCurrentVoucher()
  // 框架会自动根据 dataViewKey 绑定刷新分录表格
  console.log('当前凭证切换:', row ? row.voucherNo : '无')
}

// ========== 凭证操作 ==========

// 新增凭证 - 打开抽屉录入
function newVoucher() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var entriesView = ds.tables.Entries.views.default

  // 生成凭证号
  var today = new Date()
  var dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0')
  var voucherNo = buildNextVoucherNo(mustGetView('Voucher', 'default'))

  // 创建新凭证行（isSystem=false 确保显示在全部列表中）
  var newRow = voucherView.create({
    voucherNo: voucherNo,
    date: dateStr,
    attachmentCount: 0,
    summary: '',
    debitTotal: 0,
    creditTotal: 0,
    status: '草稿',
    isSystem: false
  })

  syncVoucherViews()

  // 聚焦新行
  voucherView.setCurrentRow(newRow.id)
  syncVoucherSelection(newRow.id)
  syncEntriesForCurrentVoucher()

  // 打开抽屉
  PageEngine.setProps('drawer__voucherEntry', { value: true })
}

// 保存凭证
function saveVoucher() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var entriesView = ds.tables.Entries.views.default
  var currentRow = voucherView.getCurrentRow()

  if (!currentRow) {
    alert('请先新增或选择一张凭证')
    return
  }

  // 计算合计
  var entries = entriesView.getAll()
  var debitTotal = 0
  var creditTotal = 0
  entries.forEach(function(entry) {
    if (entry.voucherId === currentRow.id) {
      debitTotal += Number(entry.debitAmount || 0)
      creditTotal += Number(entry.creditAmount || 0)
    }
  })

  // 校验借贷平衡
  if (Math.abs(debitTotal - creditTotal) > 0.001) {
    alert('借方合计与贷方合计不相等，请检查分录！')
    return
  }

  // 更新合计到凭证
  voucherView.update(currentRow.id, {
    debitTotal: debitTotal,
    creditTotal: creditTotal
  })

  syncVoucherViews()

  alert('保存成功！')

  // 关闭抽屉
  PageEngine.setProps('drawer__voucherEntry', { value: false })
}

// 关闭抽屉
function closeDrawer() {
  PageEngine.setProps('drawer__voucherEntry', { value: false })
}

// 审核/取消审核
function auditVoucher() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var currentRow = voucherView.getCurrentRow()

  if (!currentRow) {
    alert('请先选择一张凭证')
    return
  }

  var newStatus = currentRow.status === '已审核' ? '草稿' : '已审核'
  voucherView.update(currentRow.id, {
    status: newStatus
  })
  syncVoucherViews()
  syncVoucherSelection(currentRow.id)
}

// 删除凭证
function deleteVoucher() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var entriesView = ds.tables.Entries.views.default
  var currentRow = voucherView.getCurrentRow()

  if (!currentRow) {
    alert('请先选择一张凭证')
    return
  }

  // 禁止删除系统预置凭证
  if (currentRow.isSystem) {
    alert('系统预置凭证不可删除！')
    return
  }

  if (!confirm('确定要删除凭证 ' + currentRow.voucherNo + ' 吗？')) return

  // 删除关联分录
  var entries = entriesView.getAll().slice()
  entries.forEach(function(entry) {
    if (entry.voucherId === currentRow.id) {
      entriesView.delete(entry.id)
    }
  })

  // 删除凭证
  voucherView.delete(currentRow.id)
  syncVoucherViews()

  var remainingRows = voucherView.getAll().filter(isUserVoucher)
  if (remainingRows.length > 0) {
    voucherView.setCurrentRow(remainingRows[0].id)
    syncVoucherSelection(remainingRows[0].id)
  } else {
    syncVoucherSelection(null)
  }
  syncEntriesForCurrentVoucher()
}

// 打印凭证
function printVoucher() {
  $page.showMessage('当前脚本沙箱不允许直接调用浏览器打印 API，请使用浏览器打印菜单。', 'info')
}

// 导出凭证
function exportVoucher() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var entriesView = ds.tables.Entries.views.default
  var currentRow = voucherView.getCurrentRow()

  if (!currentRow) {
    alert('请先选择一张凭证')
    return
  }

  var entries = entriesView.getAll().filter(function(e) {
    return e.voucherId === currentRow.id
  })

  var csv = '\uFEFF凭证号,日期,摘要,科目编码,借方金额,贷方金额,状态\n'
  entries.forEach(function(entry) {
    csv += currentRow.voucherNo + ',' +
           currentRow.date + ',' +
           (entry.summary || '') + ',' +
           entry.accountCode + ',' +
           (entry.debitAmount || 0) + ',' +
           (entry.creditAmount || 0) + ',' +
           currentRow.status + '\n'
  })

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  var link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '凭证_' + currentRow.voucherNo + '.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

// ========== 分录操作 ==========

// 复制分录（自定义动作，无内置替代）
function copyEntry() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var entriesView = ds.tables.Entries.views.default
  var currentRow = voucherView.getCurrentRow()

  if (!currentRow) {
    alert('请先选择一张凭证')
    return
  }

  var selectedIds = entriesView.getSelectedRowIds()
  if (!selectedIds || selectedIds.length === 0) {
    alert('请先选择要复制的分录')
    return
  }

  selectedIds.forEach(function(id) {
    var row = entriesView.getById(id)
    if (row) {
      entriesView.create({
        voucherId: currentRow.id,
        accountCode: row.accountCode,
        accountName: row.accountName,
        debitAmount: row.debitAmount || 0,
        creditAmount: row.creditAmount || 0,
        summary: row.summary || ''
      })
    }
  })
}

// 清空分录（自定义动作，无内置替代）
function clearEntries() {
  var ds = getLegacyPageDataSet()
  var voucherView = ds.tables.Voucher.views.default
  var entriesView = ds.tables.Entries.views.default
  var currentRow = voucherView.getCurrentRow()

  if (!currentRow) {
    alert('请先选择一张凭证')
    return
  }

  if (!confirm('确定清空当前凭证的所有分录吗？')) return

  var entries = entriesView.getAll().slice()
  entries.forEach(function(entry) {
    if (entry.voucherId === currentRow.id) {
      entriesView.delete(entry.id)
    }
  })
}
