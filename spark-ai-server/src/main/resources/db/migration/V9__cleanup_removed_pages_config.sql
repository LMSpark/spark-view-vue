-- Generated from spark-ai-server/data/pages-config/deleted-pages.json
-- Do not edit by hand; regenerate via scripts/migrate-pages-config-cleanup.mjs helpers if the list changes.

DELETE nav FROM NAVIGATION_NODE_FLAT nav
INNER JOIN (
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '_plan_1773772508866' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '05032f5e-91f1-4fda-936b-7f7c3e10b6e8' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '0f712ebf-6ebf-4a0e-9e86-ff31280e9f16' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '123' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '1234' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '125' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '5b481dfc-ad4f-4427-aa05-488675d85195' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'A' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'AAAA' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABC' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABCD' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'c7b393f2-1bbf-4ea2-bd4d-9883a22e1587' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page-1' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'placeholder-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'toolbar-layout-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ai-studio' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'product-catalog' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'work-evaluation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'user-management' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'formcreate-api' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'table-configurator' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-list-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-playground' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-series' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-library' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-templates' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'pm-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'progress-report' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-detail' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-gantt' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'resource-allocation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-board' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-list' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'team-members' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'workload-stats' AS page_id
) cleanup_scope
  ON nav.TENANT_ID = cleanup_scope.tenant_id
 AND nav.PROJECT_ID = cleanup_scope.project_id
 AND nav.PARENT_ID = cleanup_scope.page_id;

DELETE nav FROM NAVIGATION_NODE_FLAT nav
INNER JOIN (
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '_plan_1773772508866' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '05032f5e-91f1-4fda-936b-7f7c3e10b6e8' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '0f712ebf-6ebf-4a0e-9e86-ff31280e9f16' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '123' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '1234' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '125' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '5b481dfc-ad4f-4427-aa05-488675d85195' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'A' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'AAAA' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABC' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABCD' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'c7b393f2-1bbf-4ea2-bd4d-9883a22e1587' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page-1' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'placeholder-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'toolbar-layout-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ai-studio' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'product-catalog' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'work-evaluation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'user-management' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'formcreate-api' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'table-configurator' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-list-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-playground' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-series' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-library' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-templates' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'pm-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'progress-report' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-detail' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-gantt' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'resource-allocation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-board' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-list' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'team-members' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'workload-stats' AS page_id
) cleanup_scope
  ON nav.TENANT_ID = cleanup_scope.tenant_id
 AND nav.PROJECT_ID = cleanup_scope.project_id
 AND (
   nav.NODE_ID = cleanup_scope.page_id
   OR nav.PATH = CONCAT('/', cleanup_scope.page_id)
   OR nav.REF_ID = cleanup_scope.page_id
 );

DELETE fv FROM file_version fv
INNER JOIN (
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '_plan_1773772508866' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '05032f5e-91f1-4fda-936b-7f7c3e10b6e8' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '0f712ebf-6ebf-4a0e-9e86-ff31280e9f16' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '123' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '1234' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '125' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '5b481dfc-ad4f-4427-aa05-488675d85195' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'A' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'AAAA' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABC' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABCD' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'c7b393f2-1bbf-4ea2-bd4d-9883a22e1587' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page-1' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'placeholder-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'toolbar-layout-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ai-studio' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'product-catalog' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'work-evaluation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'user-management' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'formcreate-api' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'table-configurator' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-list-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-playground' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-series' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-library' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-templates' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'pm-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'progress-report' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-detail' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-gantt' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'resource-allocation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-board' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-list' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'team-members' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'workload-stats' AS page_id
) cleanup_scope
  ON fv.tenant_id = cleanup_scope.tenant_id
 AND fv.project_id = cleanup_scope.project_id
 AND fv.page_id = cleanup_scope.page_id;

DELETE pcf FROM page_config_file pcf
INNER JOIN (
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '_plan_1773772508866' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '05032f5e-91f1-4fda-936b-7f7c3e10b6e8' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '0f712ebf-6ebf-4a0e-9e86-ff31280e9f16' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '123' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '1234' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '125' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, '5b481dfc-ad4f-4427-aa05-488675d85195' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'A' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'AAAA' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABC' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ABCD' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'c7b393f2-1bbf-4ea2-bd4d-9883a22e1587' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'my-page-1' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'placeholder-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'toolbar-layout-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'ai-studio' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'product-catalog' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'work-evaluation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'user-management' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'formcreate-api' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'table-configurator' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-list-demo' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-playground' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'homepage' AS project_id, 'r-table-series' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-library' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'doc-templates' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'pm-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'progress-report' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-dashboard' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-detail' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'project-gantt' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'resource-allocation' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-board' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'task-list' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'team-members' AS page_id
  UNION ALL
  SELECT 'lmspark' AS tenant_id, 'engineering-pm' AS project_id, 'workload-stats' AS page_id
) cleanup_scope
  ON pcf.tenant_id = cleanup_scope.tenant_id
 AND pcf.project_id = cleanup_scope.project_id
 AND pcf.page_id = cleanup_scope.page_id;
