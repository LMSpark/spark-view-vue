SET @add_project_home_node_id = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE project ADD COLUMN home_node_id VARCHAR(255) NULL AFTER description',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'project'
    AND column_name = 'home_node_id'
);

PREPARE stmt FROM @add_project_home_node_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
