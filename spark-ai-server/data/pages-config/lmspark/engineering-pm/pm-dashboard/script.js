let _pageState = {
  projectCount: 5,
  taskCount: 12,
  memberCount: 18,
  overdueCount: 3,
  activities: [
    { text: "张三 完成了任务「接口文档编写」", time: "10分钟前" },
    { text: "李四 创建了任务「前端页面开发」", time: "30分钟前" },
    { text: "王五 上传了文档「需求规格说明书v2.0」", time: "1小时前" },
    { text: "赵六 更新了项目「智慧园区项目」进度至68%", time: "2小时前" },
    { text: "项目「ERP升级项目」进入验收阶段", time: "3小时前" }
  ]
}

function RenderProjectCount() { return h('span', String(_pageState.projectCount)) }
function RenderTaskCount() { return h('span', String(_pageState.taskCount)) }
function RenderMemberCount() { return h('span', String(_pageState.memberCount)) }
function RenderOverdueCount() { return h('span', String(_pageState.overdueCount)) }

function RenderRecentActivities() {
  return h('div', { style: 'display:flex;flex-direction:column;gap:12px' },
    _pageState.activities.map(function(a) {
      return h('div', { style: 'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0' }, [
        h('span', { style: 'flex:1;color:#303133;fontSize:13px' }, a.text),
        h('span', { style: 'color:#909399;fontSize:12px;whiteSpace:nowrap;marginLeft:12px' }, a.time)
      ])
    })
  )
}

function __init__() {}