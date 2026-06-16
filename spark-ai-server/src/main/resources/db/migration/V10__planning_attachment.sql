SET @add_project_planning_attachment_ref = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE project ADD COLUMN planning_attachment_ref VARCHAR(128) NULL AFTER description',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'project'
    AND column_name = 'planning_attachment_ref'
);
PREPARE stmt FROM @add_project_planning_attachment_ref;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS planning_attachment (
  id BIGINT NOT NULL AUTO_INCREMENT,
  attachment_ref VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  original_filename VARCHAR(512) NOT NULL,
  content_type VARCHAR(255),
  size_bytes BIGINT NOT NULL,
  storage_path VARCHAR(1024) NOT NULL,
  created_by VARCHAR(128),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_planning_attachment_ref (attachment_ref),
  KEY idx_planning_attachment_scope (tenant_id, project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
