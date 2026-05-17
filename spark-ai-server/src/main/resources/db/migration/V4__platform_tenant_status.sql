-- V4: platform tenant management lifecycle fields.
-- Existing tenants remain active; deletion is soft via DELETED_AT.

ALTER TABLE tenant_config
    ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN deleted_at DATETIME(6);

CREATE INDEX idx_tenant_config_status ON tenant_config (status, deleted_at);
