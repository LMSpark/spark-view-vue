let _allTasks = []
let _currentFilter = 'all'
let _nextId = 200

function __init__() {
  var view = $dataSet?.getView('Tasks', 'default')
  if (!view) return

  _allTasks = cloneRows(view.rows)
  syncMenuState(_currentFilter, _allTasks.length)

  view.events.on('currentRowChanged', function(currentRow) {
    if (!currentRow) return
    console.log('[toolbar-layout-demo] currentRowChanged ->', currentRow.title)
  })
}

function cloneRows(rows) {
  return JSON.parse(JSON.stringify(rows || []))
}

function getTaskView() {
  return $dataSet?.getView('Tasks', 'default') || null
}

function applyTaskFilter(status) {
  var view = getTaskView()
  if (!view) return

  _currentFilter = status
  var nextRows = status === 'all'
    ? cloneRows(_allTasks)
    : cloneRows(_allTasks.filter(function(row) { return row.status === status }))

  view.replaceRows(nextRows)
  view.setCurrentRow(nextRows[0] || null)
  syncMenuState(status, nextRows.length)
}

function syncMenuState(status, count) {
  var labels = {
    all: '全部',
    todo: '待处理',
    doing: '进行中',
    done: '已完成',
  }

  var buttons = Array.from($queryAll('[data-menu-filter]') || [])
  buttons.forEach(function(button) {
    var isActive = button.getAttribute('data-menu-filter') === status
    button.classList.toggle('is-active', isActive)
  })

  var summary = $query('#taskFilterSummary')
  if (summary) {
    summary.textContent = '当前筛选：' + (labels[status] || '全部') + ' · ' + count + ' 条'
  }
}

function handleCreateTask() {
  var view = getTaskView()
  if (!view) return

  var newTask = {
    id: _nextId++,
    title: '新增任务 #' + _nextId,
    owner: '系统助手',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    dueDate: '2026-04-08',
    summary: '通过页头 r-toolbar 直接创建的新任务，用于演示 page-level action strip。',
  }

  _allTasks.unshift(newTask)
  applyTaskFilter(_currentFilter)
  view.setCurrentRowById(newTask.id)
  $page.showMessage({ type: 'success', message: '已新增任务：' + newTask.title })
}

function handleRefresh() {
  applyTaskFilter(_currentFilter)
  $page.showMessage({ type: 'info', message: '已按当前筛选条件重新装载任务视图。' })
}

function handleExport() {
  var visibleCount = getTaskView()?.rows?.length || 0
  $page.showMessage({ type: 'success', message: '导出摘要完成，当前可见任务 ' + visibleCount + ' 条。' })
}

function filterAllTasks() {
  applyTaskFilter('all')
}

function filterTodoTasks() {
  applyTaskFilter('todo')
}

function filterDoingTasks() {
  applyTaskFilter('doing')
}

function filterDoneTasks() {
  applyTaskFilter('done')
}