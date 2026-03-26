function getDemoView() {
	return $dataSet?.getView('DemoData', 'default') ?? null
}

function getCurrentDemoRow() {
	return getDemoView()?.currentRow ?? null
}

function handleCreateRow() {
	const view = getDemoView()
	if (!view) {
		$page.showMessage('DemoData 视图不存在', 'warning')
		return
	}

	const nextId = view.rows.reduce((maxId, row) => {
		const currentId = typeof row.id === 'number' ? row.id : 0
		return Math.max(maxId, currentId)
	}, 1000) + 1

	view.appendRow({
		id: nextId,
		name: '新成员',
		gender: 'male',
		age: 26,
		birthday: '2000-01-01',
		status: 'pending',
		address: '待补充地址',
		score: 80,
		active: true,
	})

	const newRow = view.rows.find((row) => row.id === nextId) ?? null
	if (newRow && view.selection?.setCurrentRow) {
		view.selection.setCurrentRow(newRow)
	}
	$page.showMessage(`已新增演示数据 #${nextId}`, 'success')
}

function handleRefreshDemo() {
	const view = getDemoView()
	if (!view) {
		$page.showMessage('DemoData 视图不存在', 'warning')
		return
	}

	if (typeof view.refresh === 'function') {
		Promise.resolve(view.refresh())
			.then(() => {
				$page.showMessage('演示数据已刷新', 'success')
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error)
				$page.showMessage(`刷新失败: ${message}`, 'error')
			})
		return
	}

	$page.showMessage('当前示例使用静态数据，无需刷新', 'info')
}

function handleInspectRow() {
	const row = getCurrentDemoRow()
	if (!row) {
		$page.showMessage('请先选择一行数据', 'warning')
		return
	}
	$page.showMessage(`当前行: ${row.name} / ${row.status}`, 'info')
}

function handleDeleteCurrentRow() {
	const view = getDemoView()
	const row = getCurrentDemoRow()
	if (!view || !row) {
		$page.showMessage('请先选择一行数据', 'warning')
		return
	}

	if (typeof row.id !== 'number') {
		$page.showMessage('当前行缺少主键，无法删除', 'error')
		return
	}

	view.deleteRowById(row.id)
	$page.showMessage(`已删除 #${row.id}`, 'success')
}

function RenderToolbar() {
	return h('div', {
		style: {
			display: 'flex',
			gap: '8px',
			alignItems: 'center',
			flexWrap: 'wrap',
		},
	}, [
		h('button', {
			type: 'button',
			class: 'el-button el-button--primary',
			onClick: handleCreateRow,
		}, '新增'),
		h('button', {
			type: 'button',
			class: 'el-button',
			onClick: handleRefreshDemo,
		}, '刷新'),
	])
}

function RenderTableToolbar() {
	return h('div', {
		style: {
			display: 'flex',
			gap: '8px',
			alignItems: 'center',
			flexWrap: 'wrap',
		},
	}, [
		h('button', {
			type: 'button',
			class: 'el-button el-button--primary is-plain el-button--small',
			onClick: handleCreateRow,
		}, '+ 新增'),
		h('button', {
			type: 'button',
			class: 'el-button el-button--small',
			onClick: handleRefreshDemo,
		}, '刷新'),
	])
}

function RenderRowActions() {
	return h('div', {
		style: {
			display: 'flex',
			gap: '6px',
			justifyContent: 'center',
			flexWrap: 'wrap',
		},
	}, [
		h('button', {
			type: 'button',
			class: 'el-button el-button--small is-plain',
			onClick: handleInspectRow,
		}, '查看'),
		h('button', {
			type: 'button',
			class: 'el-button el-button--danger is-plain el-button--small',
			onClick: handleDeleteCurrentRow,
		}, '删除'),
	])
}
