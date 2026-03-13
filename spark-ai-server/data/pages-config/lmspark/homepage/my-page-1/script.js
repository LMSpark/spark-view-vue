let _pageState = {
  selectedRows: [],
  currentPage: 1,
  pageSize: 10,
  searchKeyword: ''
}

function __init__() {
  const view = $dataSet?.getView('Scores', 'default')
  if (view) {
    view.events.on('currentRowChanged', (row) => {
      console.log('当前行变更:', row)
    })
    view.events.on('rowsChanged', () => {
      updatePaginationTotal()
    })
  }
  updatePaginationTotal()
  updateDeleteButtonState()
}

function handleAdd() {
  $page.showPrompt('请输入新成绩信息（格式：学号,姓名,课程,成绩,等级,考试日期）', '新增成绩').then(input => {
    if (input) {
      const parts = input.split(',')
      if (parts.length === 6) {
        const [studentId, studentName, course, score, grade, examDate] = parts
        const view = $dataSet?.getView('Scores', 'default')
        if (view) {
          const newId = Math.max(...view.rows.map(r => r.id), 0) + 1
          view.appendRow({
            id: newId,
            studentId: studentId.trim(),
            studentName: studentName.trim(),
            course: course.trim(),
            score: Number(score.trim()),
            grade: grade.trim(),
            examDate: examDate.trim()
          })
          $page.showMessage('新增成功', 'success')
        }
      } else {
        $page.showAlert('输入格式不正确，请按格式输入', '错误')
      }
    }
  })
}

function handleDeleteSelected() {
  if (!Array.isArray(_pageState.selectedRows) || _pageState.selectedRows.length === 0) {
    $page.showMessage('请先选择要删除的行', 'warning')
    return
  }
  $page.showConfirm(`确认删除选中的 ${_pageState.selectedRows.length} 条记录？`).then(ok => {
    if (ok) {
      const view = $dataSet?.getView('Scores', 'default')
      if (view) {
        const rowsToDelete = [..._pageState.selectedRows]
        rowsToDelete.forEach(row => {
          view.deleteRowById(row.id)
        })
        _pageState.selectedRows = []
        updateDeleteButtonState()
        $page.showMessage('删除成功', 'success')
      }
    }
  })
}

function handleSearch() {
  const keyword = $api.getValue('searchKeyword') || ''
  _pageState.searchKeyword = keyword
  const view = $dataSet?.getView('Scores', 'default')
  if (view) {
    if (!keyword.trim()) {
      view.replaceRows(view.rows)
    } else {
      const filtered = view.rows.filter(row => 
        row.studentId.includes(keyword) || 
        row.studentName.includes(keyword)
      )
      view.replaceRows(filtered)
    }
    updatePaginationTotal()
  }
}

function handleCurrentChange(currentRow) {
  console.log('当前行变更:', currentRow)
}

function handleSelectionChange(selection) {
  _pageState.selectedRows = Array.isArray(selection) ? selection : []
  updateDeleteButtonState()
}

function handlePageChange(currentPage) {
  _pageState.currentPage = currentPage
  console.log('页码变更:', currentPage)
}

function handleSizeChange(pageSize) {
  _pageState.pageSize = pageSize
  console.log('每页大小变更:', pageSize)
}

function RenderActions() {
  const view = $dataSet?.getView('Scores', 'default')
  const currentRow = view?.currentRow
  if (!currentRow) return h('span', '无数据')
  
  const handleEdit = () => {
    $page.showPrompt(`编辑成绩信息（当前：${currentRow.score}）`, '编辑成绩', currentRow.score.toString()).then(newScore => {
      if (newScore !== null) {
        const scoreNum = Number(newScore)
        if (!isNaN(scoreNum)) {
          view.updateRowById(currentRow.id, { score: scoreNum })
          $page.showMessage('更新成功', 'success')
        } else {
          $page.showAlert('请输入有效的数字', '错误')
        }
      }
    })
  }
  
  const handleDelete = () => {
    $page.showConfirm(`确认删除 ${currentRow.studentName} 的成绩记录？`).then(ok => {
      if (ok) {
        view.deleteRowById(currentRow.id)
        $page.showMessage('删除成功', 'success')
      }
    })
  }
  
  return h('div', { style: 'display: flex; gap: 8px;' }, [
    h('button', { 
      style: 'padding: 4px 8px; background: #409eff; color: white; border: none; border-radius: 4px; cursor: pointer;',
      onClick: handleEdit
    }, '编辑'),
    h('button', { 
      style: 'padding: 4px 8px; background: #f56c6c; color: white; border: none; border-radius: 4px; cursor: pointer;',
      onClick: handleDelete
    }, '删除')
  ])
}

function updatePaginationTotal() {
  const view = $dataSet?.getView('Scores', 'default')
  if (view) {
    const total = view.rows.length
    const paginationEl = $query('.el-pagination')
    if (paginationEl) {
      paginationEl.setAttribute('data-total', total)
    }
  }
}

function updateDeleteButtonState() {
  const deleteButton = $api.el('deleteButton')
  if (deleteButton) {
    const disabled = !Array.isArray(_pageState.selectedRows) || _pageState.selectedRows.length === 0
    $api.disabled('deleteButton', disabled)
  }
}