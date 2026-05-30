export default {
  methods: {
    // 成绩等级判断：根据分数自动计算等级
    calcGrade(score) {
      if (score == null || score === '') return '未评分'
      const s = Number(score)
      if (isNaN(s)) return '无效'
      if (s >= 90) return 'A'
      if (s >= 80) return 'B'
      if (s >= 70) return 'C'
      if (s >= 60) return 'D'
      return 'F'
    },

    // 异常成绩检测：分数异常低或有异常标记
    isAbnormal(row) {
      if (!row) return false
      if (row.isAbnormal === true) return true
      const score = Number(row.score)
      if (!isNaN(score) && score < 60) return true
      return false
    },

    // 异常成绩提示文案
    abnormalTip(row) {
      if (!row) return ''
      if (row.isAbnormal === true && row.comment) return '异常: ' + row.comment
      if (row.isAbnormal === true) return '异常成绩'
      const score = Number(row.score)
      if (!isNaN(score) && score < 60) return '不及格，需关注'
      return ''
    },

    // 等级标签样式类名
    gradeClass(row) {
      const g = (row && row.grade) ? String(row.grade).toUpperCase() : ''
      const map = { A: 'grade-a', B: 'grade-b', C: 'grade-c', D: 'grade-d', F: 'grade-f' }
      return map[g] || ''
    },

    // 关键词搜索
    searchgrade(rows, keyword) {
      const value = String(keyword || '').trim().toLowerCase()
      if (!value) return rows
      return rows.filter(row =>
        Object.values(row || {}).some(item =>
          String(item || '').toLowerCase().includes(value)
        )
      )
    },

    // 按班级筛选
    filterByClass(rows, className) {
      if (!className || className === '全部') return rows
      return rows.filter(row => row.className === className)
    },

    // 按课程筛选
    filterByCourse(rows, courseName) {
      if (!courseName || courseName === '全部') return rows
      return rows.filter(row => row.courseName === courseName)
    },

    // 统计摘要
    summaryStats(rows) {
      if (!rows || rows.length === 0) {
        return { total: 0, avg: 0, max: 0, min: 0, abnormalCount: 0 }
      }
      const scores = rows.map(r => Number(r.score)).filter(s => !isNaN(s))
      return {
        total: rows.length,
        avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
        max: scores.length ? Math.max(...scores) : 0,
        min: scores.length ? Math.min(...scores) : 0,
        abnormalCount: rows.filter(r => this.isAbnormal(r)).length
      }
    },

    // 等级分布统计
    gradeDistribution(rows) {
      const dist = { A: 0, B: 0, C: 0, D: 0, F: 0, '未评分': 0 }
      if (!rows) return dist
      rows.forEach(row => {
        const g = (row.grade || '未评分')
        dist[g] = (dist[g] || 0) + 1
      })
      return dist
    }
  }
}
