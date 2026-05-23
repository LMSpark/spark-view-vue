SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE ai_message ADD COLUMN tenant_id VARCHAR(64) NULL AFTER session_id',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_message'
    AND column_name = 'tenant_id'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE ai_message ADD COLUMN project_id VARCHAR(64) NULL AFTER tenant_id',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_message'
    AND column_name = 'project_id'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE ai_tool_call ADD COLUMN tenant_id VARCHAR(64) NULL AFTER session_id',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tool_call'
    AND column_name = 'tenant_id'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE ai_tool_call ADD COLUMN project_id VARCHAR(64) NULL AFTER tenant_id',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tool_call'
    AND column_name = 'project_id'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE ai_context_snapshot ADD COLUMN tenant_id VARCHAR(64) NULL AFTER session_id',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_context_snapshot'
    AND column_name = 'tenant_id'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE ai_context_snapshot ADD COLUMN project_id VARCHAR(64) NULL AFTER tenant_id',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_context_snapshot'
    AND column_name = 'project_id'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

UPDATE ai_message m
LEFT JOIN ai_session s ON s.session_id = m.session_id
SET
  m.tenant_id = COALESCE(NULLIF(m.tenant_id, ''), NULLIF(s.tenant_id, ''), ''),
  m.project_id = COALESCE(NULLIF(m.project_id, ''), NULLIF(s.project_id, ''), 'homepage')
WHERE m.tenant_id IS NULL
   OR m.tenant_id = ''
   OR m.project_id IS NULL
   OR m.project_id = '';

UPDATE ai_tool_call c
LEFT JOIN ai_session s ON s.session_id = c.session_id
SET
  c.tenant_id = COALESCE(NULLIF(c.tenant_id, ''), NULLIF(s.tenant_id, ''), ''),
  c.project_id = COALESCE(NULLIF(c.project_id, ''), NULLIF(s.project_id, ''), 'homepage')
WHERE c.tenant_id IS NULL
   OR c.tenant_id = ''
   OR c.project_id IS NULL
   OR c.project_id = '';

UPDATE ai_context_snapshot c
LEFT JOIN ai_session s ON s.session_id = c.session_id
SET
  c.tenant_id = COALESCE(NULLIF(c.tenant_id, ''), NULLIF(s.tenant_id, ''), ''),
  c.project_id = COALESCE(NULLIF(c.project_id, ''), NULLIF(s.project_id, ''), 'homepage')
WHERE c.tenant_id IS NULL
   OR c.tenant_id = ''
   OR c.project_id IS NULL
   OR c.project_id = '';

ALTER TABLE ai_message
  MODIFY tenant_id VARCHAR(64) NOT NULL,
  MODIFY project_id VARCHAR(64) NOT NULL;

ALTER TABLE ai_tool_call
  MODIFY tenant_id VARCHAR(64) NOT NULL,
  MODIFY project_id VARCHAR(64) NOT NULL;

ALTER TABLE ai_context_snapshot
  MODIFY tenant_id VARCHAR(64) NOT NULL,
  MODIFY project_id VARCHAR(64) NOT NULL;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX idx_ai_message_scope ON ai_message (tenant_id, project_id, session_id)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_message'
    AND index_name = 'idx_ai_message_scope'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX idx_ai_tool_call_scope ON ai_tool_call (tenant_id, project_id, session_id)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tool_call'
    AND index_name = 'idx_ai_tool_call_scope'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;

SET @spark_sql = (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX idx_ai_context_scope ON ai_context_snapshot (tenant_id, project_id, session_id)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_context_snapshot'
    AND index_name = 'idx_ai_context_scope'
);
PREPARE spark_stmt FROM @spark_sql;
EXECUTE spark_stmt;
DEALLOCATE PREPARE spark_stmt;
