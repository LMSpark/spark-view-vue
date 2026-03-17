@@proposal:data-model
```json
{
  "tableName": "Documents",
  "description": "项目文档管理表，存储与项目相关的各类文档信息。",
  "fields": [
    {"name": "id", "type": "string", "required": true, "isPrimaryKey": true, "description": "文档唯一标识"},
    {"name": "projectId", "type": "string", "required": true, "description": "关联的项目ID，外键指向Projects表"},
    {"name": "title", "type": "string", "required": true, "description": "文档标题"},
    {"name": "category", "type": "string", "required": true, "description": "文档分类（如：需求文档、设计稿、会议纪要、合同）"},
    {"name": "filePath", "type": "string", "required": true, "description": "文件在服务器或云存储中的路径/URL"},
    {"name": "fileSize", "type": "number", "required": false, "description": "文件大小（单位：字节）"},
    {"name": "version", "type": "string", "required": false, "description": "文档版本号"},
    {"name": "uploaderId", "type": "string", "required": true, "description": "上传者ID，外键指向TeamMembers表"},
    {"name": "description", "type": "text", "required": false, "description": "文档描述或备注"},
    {"name": "createdAt", "type": "datetime", "required": true, "description": "创建时间"},
    {"name": "updatedAt", "type": "datetime", "required": true, "description": "最后更新时间"}
  ]
}
```
@@end

@@proposal:data-model
```json
{
  "tableName": "WorkLogs",
  "description": "工作任务日志表，记录成员在具体任务上花费的工时。",
  "fields": [
    {"name": "id", "type": "string", "required": true, "isPrimaryKey": true, "description": "日志唯一标识"},
    {"name": "taskId", "type": "string", "required": true, "description": "关联的任务ID，外键指向Tasks表"},
    {"name": "memberId", "type": "string", "required": true, "description": "关联的成员ID，外键指向TeamMembers表"},
    {"name": "logDate", "type": "date", "required": true, "description": "日志日期（记录哪一天的工作）"},
    {"name": "hours", "type": "number", "required": true, "description": "花费的小时数"},
    {"name": "description", "type": "text", "required": false, "description": "工作内容详细描述"},
    {"name": "createdAt", "type": "datetime", "required": true, "description": "日志创建时间"}
  ]
}
```
@@end

@@proposal:function-plan
**页面ID:** project-list
**所属模块:** project-mgmt (项目管理)
**核心功能:** 集中展示所有项目信息，并提供基础的增删改查与筛选能力。
**数据绑定:**
*   主数据表: `Projects`
*   关联数据: 无（此页面主要展示项目自身信息）。
**交互与组件规划:**
1.  **布局:** 采用顶部操作栏与下方表格区域的经典布局。
2.  **顶部操作栏:**
    *   **筛选区:** 提供基于`status`（状态）字段的下拉筛选器。
    *   **操作按钮区:** 包含“新增项目”、“批量删除”、“刷新”按钮。
3.  **表格区域 (`r-table`):**
    *   **列显示:** `name`(项目名称), `code`(项目编码), `managerId`(显示为负责人姓名), `status`(状态，使用标签组件如`<a-tag>`渲染), `startDate`, `endDate`, `createdAt`。
    *   **行操作列:** 每行提供“编辑”、“删除”操作图标/按钮。
4.  **弹窗交互:**
    *   **新增/编辑弹窗:** 点击“新增项目”或行内“编辑”时，弹出表单弹窗，表单字段对应`Projects`表结构。
    *   **删除确认:** 点击“删除”时，弹出二次确认对话框。
@@end

@@proposal:function-plan
**页面ID:** task-list
**所属模块:** task-mgmt (任务管理)
**核心功能:** 展示项目下的任务清单，支持任务的新增、编辑和关联查询。
**数据绑定:**
*   主数据表: `Tasks`
*   关键关联:
    *   `projectId` -> `Projects.name` (用于显示所属项目名称)
    *   `parentId` -> 自关联 `Tasks.title` (用于显示父级任务)
**交互与组件规划:**
1.  **布局:** 左侧项目树/选择区，右侧任务表格。
2.  **左侧项目选择区:**
    *   组件: `r-tree-select` 或 `r-select`。
    *   功能: 列出所有`Projects`，选择后，右侧表格仅显示该项目下的任务（通过`projectId`筛选）。
3.  **右侧表格区域 (`r-table`):**
    *   **列显示:** `title`(任务标题), `projectId`(显示为项目名称), `parentId`(显示为父任务标题，为空则显示“-”), `priority`(优先级，使用标签渲染), `status`, `assigneeId`(显示为指派成员姓名), `dueDate`。
    *   **行操作列:** 提供“编辑”、“记录工时”（可跳转或弹窗）操作。
4.  **顶部操作栏:**
    *   **全局筛选:** 除项目筛选外，可增加基于`status`, `priority`, `assigneeId`的快速筛选。
    *   **操作按钮:** “创建任务”、“刷新”。
5.  **弹窗交互:**
    *   **新增/编辑弹窗:** 表单中包含`projectId`（下拉选择）、`parentId`（级联选择，根据所选`projectId`动态加载任务）、`title`、`description`、`priority`、`status`、`assigneeId`（从`TeamMembers`选择）等字段。
@@end

@@proposal:function-plan
**页面ID:** team-members
**所属模块:** resource-mgmt (资源管理)
**核心功能:** 管理团队成员信息，支持按技能搜索。
**数据绑定:**
*   主数据表: `TeamMembers`
**交互与组件规划:**
1.  **布局:** 顶部搜索栏与操作栏，下方成员表格。
2.  **顶部操作栏:**
    *   **搜索区:** 提供关键字搜索框，支持对`name`、`skills`（技能）字段进行模糊搜索。
    *   **操作按钮区:** “新增成员”、“刷新”。
3.  **表格区域 (`r-table`):**
    *   **列显示:** `name`(姓名), `role`(角色), `skills`(技能，多值显示，如`<a-tag>`数组), `status`(在职状态), `createdAt`。
    *   **行操作列:** 提供“编辑”、“设为无效/离职”等操作。
4.  **弹窗交互:**
    *   **新增/编辑弹窗:** 表单包含`name`、`role`、`skills`（可使用`r-select`多选模式，选项可配置如“Java”，“UI设计”，“项目管理”等）、`status`等字段。
@@end
