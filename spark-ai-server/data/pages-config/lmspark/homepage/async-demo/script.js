let _seed = Date.now() % 100000

function _nextRandom() {
	_seed = (_seed * 9301 + 49297) % 233280
	return _seed / 233280
}

function _randomInt(min, max) {
	return Math.floor(_nextRandom() * (max - min + 1)) + min
}

function _ordersView() {
	return $dataSet?.getView('RecentOrders', 'default') ?? null
}

function _statsView() {
	return $dataSet?.getView('Stats', 'default') ?? null
}

function _resolveDataKeyValue(dataKey) {
	if (!dataKey || typeof dataKey !== 'string') return '--'
	const [tableName, rawPath] = dataKey.split('@')
	if (!tableName || !rawPath) return '--'

	const view = $dataSet?.getView(tableName, 'default')
	if (!view) return '--'

	if (rawPath === 'rows') return Array.isArray(view.rows) ? view.rows.length : 0
	if (rawPath === 'currentRow') return view.currentRow ?? view.rows?.[0] ?? '--'
	if (rawPath.startsWith('currentRow.')) {
		const field = rawPath.slice('currentRow.'.length)
		const row = view.currentRow ?? view.rows?.[0] ?? null
		return row && field in row ? row[field] : '--'
	}
	return '--'
}

function _buildOrderRows() {
	const baseDate = new Date()
	const statuses = ['待支付', '已支付', '已发货', '已完成']
	const rows = []

	for (let i = 0; i < 8; i++) {
		const amount = _randomInt(120, 1800)
		const date = new Date(baseDate)
		date.setDate(baseDate.getDate() - i)
		rows.push({
			id: i + 1,
			orderNo: `ORD-${date.getFullYear()}${String(i + 1).padStart(3, '0')}`,
			customer: `客户${String.fromCharCode(65 + (i % 6))}`,
			amount,
			status: statuses[_randomInt(0, statuses.length - 1)],
			date: date.toISOString().slice(0, 10),
		})
	}

	return rows
}

function _syncStatsFromOrders(rows) {
	const statsView = _statsView()
	if (!statsView) return

	const totalUsers = new Set(rows.map(row => row.customer)).size
	const today = new Date().toISOString().slice(0, 10)
	const todayOrders = rows.filter(row => row.date === today).length
	const revenue = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

	const nextStats = [{
		id: 1,
		totalUsers,
		todayOrders,
		revenue,
	}]

	statsView.replaceRows(nextStats)
}

function _refreshAllData() {
	const ordersView = _ordersView()
	if (!ordersView) return
	const rows = _buildOrderRows()
	ordersView.replaceRows(rows)
	_syncStatsFromOrders(rows)
}

function __init__() {
	const ordersView = _ordersView()
	if (!ordersView) return

	if (!Array.isArray(ordersView.rows) || ordersView.rows.length === 0) {
		_refreshAllData()
		return
	}

	_syncStatsFromOrders(ordersView.rows)
}

function RenderRefreshButton() {
	return h('button', {
		class: 'el-button el-button--primary',
		onClick: function () {
			_refreshAllData()
			$page?.showMessage?.('统计与订单数据已刷新', 'success')
		}
	}, '刷新数据')
}

function RenderRefreshOrdersButton() {
	return h('button', {
		class: 'el-button el-button--default',
		onClick: function () {
			_refreshAllData()
			$page?.showMessage?.('订单列表已刷新', 'success')
		}
	}, '刷新订单')
}

function RenderStatCard(props) {
	const label = typeof props?.label === 'string' ? props.label : '指标'
	const dataKey = typeof props?.dataKey === 'string' ? props.dataKey : ''
	const rawValue = _resolveDataKeyValue(dataKey)

	let displayValue = rawValue
	if (typeof rawValue === 'number') {
		displayValue = label.includes('收入') || label.includes('金额')
			? `¥${rawValue.toLocaleString('zh-CN')}`
			: rawValue.toLocaleString('zh-CN')
	}

	return h('div', { class: 'stat-item' }, [
		h('div', { class: 'stat-label' }, label),
		h('div', { class: 'stat-value' }, String(displayValue ?? '--')),
	])
}
