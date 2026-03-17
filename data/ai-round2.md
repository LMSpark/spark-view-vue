@@proposal:navigation
**模块名称**：文档管理模块 (doc-mgmt)
**模块描述**：集中管理项目相关的所有文档，支持版本控制、协作与模板化，确保项目资料有序、可追溯。
**包含子页面**：
1.  **文档库 (doc-library)**：项目文档的集中存储、分类、检索与查看页面。支持上传、下载、版本历史查看和权限管理。
2.  **文档模板 (doc-templates)**：存放各类标准文档模板（如项目计划书、会议纪要、验收报告等）的页面，支持一键创建新文档。
@@end

@@proposal:navigation
**模块名称**：报表中心模块 (report-center)
**模块描述**：提供多维度的数据可视化与分析报表，帮助管理者实时掌握项目健康度、团队效能与资源投入。
**包含子页面**：
1.  **项目仪表盘 (project-dashboard)**：核心KPI概览，以图表形式展示项目整体进度、预算消耗、风险数量等关键指标。
2.  **进度报表 (progress-report)**：生成和查看详细的项目/任务进度报告，支持按时间、负责人等多维度筛选。
3.  **工时统计 (workload-stats)**：分析团队成员或整个项目的工时投入情况，对比预估与实际工时，评估工作负荷。
@@end

@@proposal:data-model
```json
{
  "tableName": "Projects",
  "columns": [
    {"name": "id", "type": "string", "primaryKey": true, "comment": "项目唯一标识"},
    {"name": "name", "type": "string", "required": true, "comment": "项目名称"},
    {"name": "code", "type": "string", "unique": true, "comment": "项目编号"},
    {"name": "status", "type": "string", "comment": "状态（如：规划中、进行中、已暂停、已完结）"},
    {"name": "priority", "type": "string", "comment": "优先级（如：高、中、低）"},
    {"name": "startDate", "type": "date", "comment": "计划开始日期"},
    {"name": "endDate", "type": "date", "comment": "计划结束日期"},
    {"name": "managerId", "type": "string", "comment": "项目经理ID，关联TeamMembers表"},
    {"name": "budget", "type": "number", "comment": "项目总预算"},
    {"name": "progress", "type": "number", "comment": "整体进度百分比（0-100）"},
    {"name": "description", "type": "text", "comment": "项目描述"},
    {"name": "createdAt", "type": "datetime", "comment": "创建时间"}
  ]
}
```
@@end

@@proposal:data-model
```json
{
  "tableName": "Tasks",
  "columns": [
    {"name": "id", "type": "string", "primaryKey": true, "comment": "任务唯一标识"},
    {"name": "projectId", "type": "string", "required": true, "comment": "所属项目ID，关联Projects表"},
    {"name": "title", "type": "string", "required": true, "comment": "任务标题"},
    {"name": "status", "type": "string", "comment": "状态（如：未开始、进行中、待审核、已完成）"},
    {"name": "priority", "type": "string", "comment": "优先级（如：紧急、高、中、低）"},
    {"name": "assigneeId", "type": "string", "comment": "负责人ID，关联TeamMembers表"},
    {"name": "startDate", "type": "date", "comment": "计划开始日期"},
    {"name": "dueDate", "type": "date", "comment": "计划截止日期"},
    {"name": "estimatedHours", "type": "number", "comment": "预估工时"},
    {"name": "actualHours", "type": "number", "comment": "实际工时"},
    {"name": "description", "type": "text", "comment": "任务详情描述"},
    {"name": "createdAt", "type": "datetime", "comment": "创建时间"}
  ]
}
```
@@end

@@proposal:data-model
```json
{
  "tableName": "TeamMembers",
  "columns": [
    {"name": "id", "type": "string", "primaryKey": true, "comment": "成员唯一标识"},
    {"name": "name", "type": "string", "required": true, "comment": "成员姓名"},
    {"name": "email", "type": "string", "required": true, "unique": true, "comment": "电子邮箱（登录账号）"},
    {"name": "role", "type": "string", "comment": "角色（如：项目经理、开发工程师、设计师）"},
    {"name": "department", "type": "string", "comment": "所属部门"},
    {"name": "skills", "type": "text", "comment": "技能标签（如：JavaScript, UI设计, 项目管理），可存储为JSON数组或逗号分隔字符串"},
    {"name": "phone", "type": "string", "comment": "联系电话"},
    {"name": "joinDate", "type": "date", "comment": "加入项目日期"}
  ]
}
```
@@end
