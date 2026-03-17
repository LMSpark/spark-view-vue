@@proposal:navigation
{
  "name": "项目管理",
  "nodeKind": "module",
  "key": "project-mgmt",
  "children": [
    {
      "name": "项目列表",
      "nodeKind": "page",
      "key": "project-list",
      "description": "所有项目的总览列表，支持按状态、负责人、时间筛选，可快速创建新项目。"
    },
    {
      "name": "项目详情",
      "nodeKind": "page",
      "key": "project-detail",
      "description": "单个项目的完整信息页面，包含基本信息、里程碑、文档、关联任务与资源。"
    },
    {
      "name": "项目甘特图",
      "nodeKind": "page",
      "key": "project-gantt",
      "description": "可视化项目时间线与任务依赖关系，支持拖拽调整计划。"
    }
  ]
}
@@end

@@proposal:navigation
{
  "name": "任务管理",
  "nodeKind": "module",
  "key": "task-mgmt",
  "children": [
    {
      "name": "任务看板",
      "nodeKind": "page",
      "key": "task-kanban",
      "description": "基于看板（To Do/Doing/Done等）的可视化任务管理，支持拖拽任务状态更新。"
    },
    {
      "name": "任务列表",
      "nodeKind": "page",
      "key": "task-list",
      "description": "所有任务的表格化列表，支持高级筛选、排序、批量操作与导出。"
    }
  ]
}
@@end

@@proposal:navigation
{
  "name": "资源管理",
  "nodeKind": "module",
  "key": "resource-mgmt",
  "children": [
    {
      "name": "团队成员",
      "nodeKind": "page",
      "key": "team-members",
      "description": "管理项目团队成员信息、角色、技能与联系方式。"
    },
    {
      "name": "资源分配",
      "nodeKind": "page",
      "key": "resource-allocation",
      "description": "查看与调整人力、设备等资源在项目及任务中的分配情况与负荷。"
    }
  ]
}
@@end
