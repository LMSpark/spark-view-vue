let _pageState = { selectedRow: null }

function __init__() {
  const view = $dataSet?.getView('Students', 'default')
  view?.events.on('currentRowChanged', (row) => {
    _pageState.selectedRow = row
    console.log('当前行变更:', row)
  })
}

function handleAdd() {
  const view = $dataSet?.getView('Students', 'default')
  const newId = view.rows.length > 0 ? Math.max(...view.rows.map(r => r.id)) + 1 : 1
  const newRow = {
    id: newId,
    name: '新学生',
    gender: '男',
    subject: '未指定',
    score: 0,
    grade: '待评定',
    examDate: '2024-01-01',
    teacher: '待分配'
  }
  view.appendRow(newRow)
  view.setCurrentRow(newRow)
  $page.showMessage('新增成绩成功', 'success')
}

function handleEdit() {
  const view = $dataSet?.getView('Students', 'default')
  const currentRow = view.currentRow
  if (!currentRow) {
    $page.showMessage('请先选择一行进行编辑', 'warning')
    return
  }
  $page.showPrompt('请输入新的成绩分数（0-100）', '编辑成绩', currentRow.score.toString()).then(newScore => {
    if (newScore && !isNaN(newScore)) {
      const scoreNum = parseInt(newScore)
      if (scoreNum >= 0 && scoreNum <= 100) {
        let grade = '不及格'
        if (scoreNum >= 90) grade = '优秀'
        else if (scoreNum >= 80) grade = '良好'
        else if (scoreNum >= 70) grade = '中等'
        else if (scoreNum >= 60) grade = '及格'
        view.updateRowById(currentRow.id, { score: scoreNum, grade: grade })
        $page.showMessage('成绩已更新', 'success')
      } else {
        $page.showMessage('成绩必须在0-100之间', 'error')
      }
    }
  })
}

function handleDelete() {
  const view = $dataSet?.getView('Students', 'default')
  const currentRow = view.currentRow
  if (!currentRow) {
    $page.showMessage('请先选择一行进行删除', 'warning')
    return
  }
  $page.showConfirm(`确认删除学生“${currentRow.name}”的成绩记录？`).then(ok => {
    if (ok) {
      view.deleteRowById(currentRow.id)
      $page.showMessage('成绩记录已删除', 'success')
    }
  })
}

function handleCurrentChange(currentRow) {
  console.log('表格当前行变更:', currentRow)
}