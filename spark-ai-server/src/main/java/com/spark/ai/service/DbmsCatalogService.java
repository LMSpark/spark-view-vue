package com.spark.ai.service;

import com.spark.ai.config.CryptoUtil;
import com.spark.ai.config.DatabaseDialect;
import com.spark.ai.config.DynamicDataSourceManager;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class DbmsCatalogService {

    private static final String OBJECT_TABLE = "TABLE";
    private static final String OBJECT_VIEW = "VIEW";
    private static final String ORIGIN_PHYSICAL_SYNCED = "physical-synced";
    private static final String MODE_READONLY = "readonly";
    private static final String MODE_STRICT = DynamicDataModelService.MANAGED_MODE_STRICT;
    private static final Pattern SAFE_ALIAS = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Set<String> MYSQL_SYSTEM_DATABASES = Set.of("information_schema", "mysql", "performance_schema", "sys");
    private static final Set<String> POSTGRES_SYSTEM_SCHEMAS = Set.of("information_schema", "pg_catalog", "pg_toast");

    private final JdbcTemplate jdbc;
    private final CryptoUtil cryptoUtil;
    private final DynamicDataSourceManager dsManager;
    private final DataModelRelationService relationService;
    private final DynamicDataModelService modelService;

    public DbmsCatalogService(JdbcTemplate jdbc,
                              CryptoUtil cryptoUtil,
                              DynamicDataSourceManager dsManager,
                              DataModelRelationService relationService,
                              DynamicDataModelService modelService) {
        this.jdbc = jdbc;
        this.cryptoUtil = cryptoUtil;
        this.dsManager = dsManager;
        this.relationService = relationService;
        this.modelService = modelService;
    }

    public Map<String, Object> catalog(String tenantId,
                                       String projectId,
                                       Long serverId,
                                       boolean isPlatformAdmin,
                                       String currentTenant) {
        ServerInfo server = loadServer(serverId, isPlatformAdmin, currentTenant);
        List<String> databaseNames = listPhysicalDatabaseNames(server);
        List<PhysicalDatabase> databases = scanDatabases(tenantId, projectId, server, databaseNames, true, true, true);
        return catalogPayload(server, databases);
    }

    @Transactional
    public Map<String, Object> sync(String tenantId,
                                    String projectId,
                                    Long serverId,
                                    Map<String, Object> body,
                                    String createdBy,
                                    boolean isPlatformAdmin,
                                    String currentTenant) {
        ServerInfo server = loadServer(serverId, isPlatformAdmin, currentTenant);
        String scopeMode = stringValue(body.get("scopeMode"), "PLATFORM_SHARED");
        if (!"PLATFORM_SHARED".equals(scopeMode)) {
            throw new IllegalArgumentException("scopeMode 目前仅支持 PLATFORM_SHARED");
        }
        boolean includeTables = booleanValue(body.get("includeTables"), true);
        boolean includeViews = booleanValue(body.get("includeViews"), true);
        boolean includeRelations = booleanValue(body.get("includeRelations"), true);
        Set<PhysicalObjectKey> mutateKeys = readMutateKeys(body.get("mutatePhysicalObjectKeys"));

        List<String> databaseNames = readDatabaseNames(body.get("databaseNames"));
        if (databaseNames.isEmpty()) {
            databaseNames = listPhysicalDatabaseNames(server);
        }

        List<PhysicalDatabase> scanned = scanDatabases(tenantId, projectId, server, databaseNames, includeTables, includeViews, includeRelations);
        List<Map<String, Object>> syncedDatabases = new ArrayList<>();
        int objectCount = 0;
        int relationCount = 0;
        for (PhysicalDatabase database : scanned) {
            long databaseId = upsertTenantSharedDatabase(server, database.databaseName(), tenantId, createdBy);
            mergeDuplicateDatabaseMetadata(server.id(), database.databaseName(), databaseId, tenantId, projectId);
            Map<ObjectLookupKey, Long> tableIds = new LinkedHashMap<>();
            List<Map<String, Object>> syncedObjects = new ArrayList<>();
            for (PhysicalObject object : database.objects()) {
                PhysicalObject withDatabase = object.withDatabaseId(databaseId);
                boolean mutate = mutateKeys.contains(withDatabase.toPhysicalObjectKey());
                PhysicalObject syncedObject = withDatabase;
                if (mutate && OBJECT_TABLE.equals(withDatabase.objectType())) {
                    syncedObject = mutateManagedShape(server, withDatabase, tenantId, projectId);
                }
                long objectId = upsertObject(tenantId, projectId, database.databaseName(), syncedObject, mutate);
                replaceColumns(objectId, syncedObject.columns());
                tableIds.put(syncedObject.lookupKey(), objectId);
                syncedObjects.add(Map.of(
                        "objectId", objectId,
                        "objectType", syncedObject.objectType(),
                        "schemaName", syncedObject.schemaName().isBlank() ? "" : syncedObject.schemaName(),
                        "physicalName", syncedObject.physicalName(),
                        "columnCount", syncedObject.columns().size()
                ));
                objectCount++;
            }
            if (includeRelations) {
                relationCount += syncRelations(tenantId, projectId, databaseId, database.foreignKeys(), tableIds);
            }
            syncedDatabases.add(Map.of(
                    "databaseId", databaseId,
                    "databaseName", database.databaseName(),
                    "objects", syncedObjects
            ));
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("serverId", server.id());
        payload.put("scopeMode", scopeMode);
        payload.put("isolationMode", DataIsolationMode.TENANT_SHARED.name());
        payload.put("databaseCount", scanned.size());
        payload.put("objectCount", objectCount);
        payload.put("relationCount", relationCount);
        payload.put("databases", syncedDatabases);
        return payload;
    }

    public Map<String, Object> objectSql(String tenantId, String projectId, long objectId) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinitionById(tenantId, projectId, objectId);
        String ddl = readNativeDdl(definition);
        String relationSql = relationSql(tenantId, projectId, objectId, definition.dialect());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("objectId", objectId);
        payload.put("objectType", definition.table().objectType());
        payload.put("dialect", definition.dialect().name());
        payload.put("ddl", ddl);
        payload.put("relationSql", relationSql);
        payload.put("readOnly", true);
        return payload;
    }

    private List<PhysicalDatabase> scanDatabases(String tenantId,
                                                 String projectId,
                                                 ServerInfo server,
                                                 List<String> databaseNames,
                                                 boolean includeTables,
                                                 boolean includeViews,
                                                 boolean includeRelations) {
        List<PhysicalDatabase> result = new ArrayList<>();
        for (String databaseName : databaseNames) {
            Long registeredDatabaseId = findRegisteredDatabaseId(tenantId, projectId, server.id(), databaseName);
            PhysicalDatabase scanned = scanDatabase(server, databaseName, includeTables, includeViews, includeRelations);
            Map<ObjectLookupKey, RegisteredObject> registeredObjects = registeredObjects(tenantId, projectId, registeredDatabaseId);
            List<PhysicalObject> objects = scanned.objects().stream()
                    .map(object -> {
                        RegisteredObject registered = registeredObjects.get(object.lookupKey());
                        return object.withRegistration(registeredDatabaseId, registered == null ? null : registered.id(), registered == null ? null : registered.logicalName());
                    })
                    .toList();
            result.add(new PhysicalDatabase(databaseName, registeredDatabaseId, objects, scanned.foreignKeys()));
        }
        return result;
    }

    private PhysicalDatabase scanDatabase(ServerInfo server,
                                          String databaseName,
                                          boolean includeTables,
                                          boolean includeViews,
                                          boolean includeRelations) {
        DatabaseDialect dialect = parseDialect(server.dbType());
        String password = cryptoUtil.decrypt(server.encryptedPassword());
        try (Connection connection = dsManager.createDatabaseConnection(
                server.host(), server.port(), server.dbType(), databaseName, server.username(), password)) {
            DatabaseMetaData metaData = connection.getMetaData();
            CatalogPattern pattern = catalogPattern(dialect, connection, databaseName);
            List<PhysicalObject> objects = new ArrayList<>();
            List<String> types = new ArrayList<>();
            if (includeTables) types.add(OBJECT_TABLE);
            if (includeViews) types.add(OBJECT_VIEW);
            if (!types.isEmpty()) {
                try (ResultSet rs = metaData.getTables(pattern.catalog(), pattern.schemaPattern(), null, types.toArray(String[]::new))) {
                    while (rs.next()) {
                        String tableType = normalizeObjectType(rs.getString("TABLE_TYPE"));
                        String schemaName = normalizeSchemaName(rs.getString("TABLE_SCHEM"));
                        String tableName = rs.getString("TABLE_NAME");
                        if (!isUserObject(dialect, schemaName, tableName)) {
                            continue;
                        }
                        objects.add(describeObject(metaData, pattern.catalog(), schemaName, tableName, tableType, databaseName));
                    }
                }
            }
            objects.sort(Comparator.comparing(PhysicalObject::schemaName, String.CASE_INSENSITIVE_ORDER)
                    .thenComparing(PhysicalObject::objectType)
                    .thenComparing(PhysicalObject::physicalName, String.CASE_INSENSITIVE_ORDER));
            List<PhysicalForeignKey> foreignKeys = includeRelations
                    ? scanForeignKeys(metaData, pattern.catalog(), objects)
                    : List.of();
            return new PhysicalDatabase(databaseName, null, objects, foreignKeys);
        } catch (SQLException e) {
            throw new IllegalStateException("扫描数据库失败: " + databaseName + " - " + e.getMessage(), e);
        }
    }

    private PhysicalObject describeObject(DatabaseMetaData metaData,
                                          String catalog,
                                          String schemaName,
                                          String physicalName,
                                          String objectType,
                                          String databaseName) throws SQLException {
        Set<String> primaryKeys = new LinkedHashSet<>();
        if (OBJECT_TABLE.equals(objectType)) {
            try (ResultSet pk = metaData.getPrimaryKeys(catalog, blankToNull(schemaName), physicalName)) {
                while (pk.next()) {
                    primaryKeys.add(pk.getString("COLUMN_NAME"));
                }
            }
        }
        List<PhysicalColumn> columns = new ArrayList<>();
        try (ResultSet rs = metaData.getColumns(catalog, blankToNull(schemaName), physicalName, null)) {
            while (rs.next()) {
                String columnName = rs.getString("COLUMN_NAME");
                int sqlTypeCode = rs.getInt("DATA_TYPE");
                String typeName = rs.getString("TYPE_NAME");
                int size = rs.getInt("COLUMN_SIZE");
                int scale = rs.getInt("DECIMAL_DIGITS");
                boolean nullable = rs.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls;
                String defaultValue = rs.getString("COLUMN_DEF");
                int ordinal = rs.getInt("ORDINAL_POSITION");
                String autoIncrement = "";
                try {
                    autoIncrement = rs.getString("IS_AUTOINCREMENT");
                } catch (Exception ignored) {
                    // Driver optional column.
                }
                columns.add(new PhysicalColumn(
                        columnName,
                        sqlTypeCode,
                        typeName,
                        size > 0 ? size : null,
                        scale >= 0 ? scale : null,
                        nullable,
                        defaultValue,
                        primaryKeys.contains(columnName),
                        "YES".equalsIgnoreCase(autoIncrement),
                        ordinal
                ));
            }
        }
        columns.sort(Comparator.comparingInt(PhysicalColumn::ordinalPosition));
        return new PhysicalObject(databaseName, null, objectType, schemaName, physicalName, columns, primaryKeys, null, null);
    }

    private List<PhysicalForeignKey> scanForeignKeys(DatabaseMetaData metaData,
                                                     String catalog,
                                                     Collection<PhysicalObject> objects) throws SQLException {
        List<PhysicalForeignKey> result = new ArrayList<>();
        for (PhysicalObject object : objects) {
            if (!OBJECT_TABLE.equals(object.objectType())) {
                continue;
            }
            try (ResultSet rs = metaData.getImportedKeys(catalog, blankToNull(object.schemaName()), object.physicalName())) {
                while (rs.next()) {
                    result.add(new PhysicalForeignKey(
                            normalizeSchemaName(rs.getString("PKTABLE_SCHEM")),
                            rs.getString("PKTABLE_NAME"),
                            rs.getString("PKCOLUMN_NAME"),
                            object.schemaName(),
                            object.physicalName(),
                            rs.getString("FKCOLUMN_NAME"),
                            stringValue(rs.getString("FK_NAME"), rs.getString("PKTABLE_NAME") + "_" + object.physicalName())
                    ));
                }
            }
        }
        return result;
    }

    private long upsertTenantSharedDatabase(ServerInfo server, String databaseName, String tenantId, String createdBy) {
        Long existing = findTenantSharedDatabaseId(server.id(), databaseName);
        Timestamp now = Timestamp.from(Instant.now());
        if (existing != null) {
            jdbc.update("""
                UPDATE DATA_SOURCE_DATABASE
                SET STATUS = 'active', CONNECTION_MODE = COALESCE(CONNECTION_MODE, 'DIRECT'), UPDATED_AT = ?
                WHERE ID = ?
                """, now, existing);
            return existing;
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO DATA_SOURCE_DATABASE (
                    SERVER_ID, DATABASE_NAME, ISOLATION_MODE, TENANT_ID, PROJECT_ID,
                    CONNECTION_MODE, JNDI_NAME, CREATED_BY, STATUS, CREATED_AT, UPDATED_AT
                ) VALUES (?, ?, 'TENANT_SHARED', ?, NULL, 'DIRECT', NULL, ?, 'active', ?, ?)
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, server.id());
            statement.setString(2, databaseName);
            statement.setString(3, tenantId);
            statement.setString(4, createdBy);
            statement.setTimestamp(5, now);
            statement.setTimestamp(6, now);
            return statement;
        }, keyHolder);
        return generatedId(keyHolder);
    }

    private long upsertObject(String tenantId,
                              String projectId,
                              String databaseName,
                              PhysicalObject object,
                              boolean mutatePhysicalShape) {
        RegisteredObject existing = findRegisteredObject(tenantId, projectId, object.databaseId(), object.lookupKey());
        String managedMode = OBJECT_VIEW.equals(object.objectType())
                ? MODE_READONLY
                : mutatePhysicalShape ? MODE_STRICT : MODE_READONLY;
        if (existing != null) {
            updateObject(existing.id(), object, managedMode);
            return existing.id();
        }
        String logicalAlias = uniqueLogicalAlias(tenantId, projectId, databaseName, object.schemaName(), object.physicalName());
        String primaryKey = object.primaryKeyColumns().stream().findFirst().orElse("");
        Timestamp now = Timestamp.from(Instant.now());
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO DATA_MODEL_TABLE (
                    TENANT_ID, PROJECT_ID, LOGICAL_TABLE_NAME, ORIGIN, MANAGED_MODE,
                    OBJECT_TYPE, SCHEMA_NAME, PHYSICAL_TABLE_NAME, PRIMARY_KEY_FIELD,
                    RESOURCE_TYPE, RESOURCE_ID, BUSINESS_CATEGORY, DATABASE_ID, ISOLATION_MODE,
                    SCHEMA_VERSION, DDL_HASH, STATUS, LAST_INTROSPECTED_AT, CREATED_AT, UPDATED_AT
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'TENANT_SHARED', 1, ?, 'active', ?, ?, ?)
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, tenantId);
            statement.setString(2, projectId);
            statement.setString(3, logicalAlias);
            statement.setString(4, ORIGIN_PHYSICAL_SYNCED);
            statement.setString(5, managedMode);
            statement.setString(6, object.objectType());
            statement.setString(7, object.schemaName());
            statement.setString(8, object.physicalName());
            statement.setString(9, primaryKey);
            statement.setLong(10, object.databaseId());
            statement.setString(11, hashObject(object));
            statement.setTimestamp(12, now);
            statement.setTimestamp(13, now);
            statement.setTimestamp(14, now);
            return statement;
        }, keyHolder);
        return generatedId(keyHolder);
    }

    private void updateObject(long tableId, PhysicalObject object, String managedMode) {
        Timestamp now = Timestamp.from(Instant.now());
        String primaryKey = object.primaryKeyColumns().stream().findFirst().orElse("");
        jdbc.update("""
            UPDATE DATA_MODEL_TABLE
            SET MANAGED_MODE = ?, OBJECT_TYPE = ?, SCHEMA_NAME = ?, PHYSICAL_TABLE_NAME = ?,
                PRIMARY_KEY_FIELD = ?, DATABASE_ID = ?, ISOLATION_MODE = 'TENANT_SHARED',
                SCHEMA_VERSION = SCHEMA_VERSION + 1, DDL_HASH = ?, STATUS = 'active',
                LAST_INTROSPECTED_AT = ?, UPDATED_AT = ?
            WHERE ID = ?
            """,
                managedMode,
                object.objectType(),
                object.schemaName(),
                object.physicalName(),
                primaryKey,
                object.databaseId(),
                hashObject(object),
                now,
                now,
                tableId);
    }

    private void replaceColumns(long tableId, List<PhysicalColumn> columns) {
        jdbc.update("DELETE FROM DATA_MODEL_COLUMN WHERE TABLE_ID = ?", tableId);
        Timestamp now = Timestamp.from(Instant.now());
        int ordinal = 0;
        for (PhysicalColumn column : columns) {
            jdbc.update("""
                INSERT INTO DATA_MODEL_COLUMN (
                    TABLE_ID, COLUMN_NAME, PHYSICAL_COLUMN_NAME, DATA_TYPE, SQL_TYPE,
                    ORDINAL_POSITION, IS_PRIMARY_KEY, IS_AUTO_INCREMENT, IS_NULLABLE,
                    IS_REQUIRED, MAX_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
                    DEFAULT_VALUE, LABEL, CREATED_AT, UPDATED_AT
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    tableId,
                    column.columnName(),
                    column.columnName(),
                    dataTypeFromSqlType(column),
                    sqlTypeFromColumn(column),
                    ordinal++,
                    column.primaryKey(),
                    column.autoIncrement(),
                    column.nullable(),
                    !column.nullable(),
                    column.size(),
                    column.size(),
                    column.scale(),
                    column.defaultValue(),
                    humanizeLabel(column.columnName()),
                    now,
                    now);
        }
    }

    private int syncRelations(String tenantId,
                              String projectId,
                              long databaseId,
                              List<PhysicalForeignKey> foreignKeys,
                              Map<ObjectLookupKey, Long> tableIds) {
        int synced = 0;
        for (PhysicalForeignKey fk : foreignKeys) {
            Long parentId = tableIds.get(new ObjectLookupKey(OBJECT_TABLE, fk.parentSchemaName(), fk.parentTableName()));
            Long childId = tableIds.get(new ObjectLookupKey(OBJECT_TABLE, fk.childSchemaName(), fk.childTableName()));
            if (parentId == null || childId == null) {
                continue;
            }
            relationService.createRelation(tenantId, projectId, Map.of(
                    "parentTableId", parentId,
                    "childTableId", childId,
                    "parentField", fk.parentColumnName(),
                    "childField", fk.childColumnName(),
                    "relationName", fk.relationName(),
                    "databaseId", databaseId
            ));
            synced++;
        }
        return synced;
    }

    private String readNativeDdl(DynamicDataModelService.TableDefinition definition) {
        if (definition.dialect() == DatabaseDialect.MYSQL) {
            String statement = "VIEW".equalsIgnoreCase(definition.table().objectType()) ? "SHOW CREATE VIEW " : "SHOW CREATE TABLE ";
            try {
                Map<String, Object> row = modelService.jdbcTemplateFor(definition).queryForMap(
                        statement + qualifiedName(definition.dialect(), definition.table().schemaName(), definition.table().physicalTableName())
                );
                for (Map.Entry<String, Object> entry : row.entrySet()) {
                    if (entry.getKey().toLowerCase(Locale.ROOT).contains("create")
                            && entry.getValue() instanceof String text
                            && !text.isBlank()) {
                        return text;
                    }
                }
            } catch (Exception ignored) {
                // Fall back to portable metadata DDL below.
            }
        }
        return fallbackDdl(definition);
    }

    private String fallbackDdl(DynamicDataModelService.TableDefinition definition) {
        String qualifiedName = qualifiedName(definition.dialect(), definition.table().schemaName(), definition.table().physicalTableName());
        if ("VIEW".equalsIgnoreCase(definition.table().objectType())) {
            return "-- View definition is not available from this driver.\n"
                    + "CREATE VIEW " + qualifiedName + " AS\n"
                    + "-- inspect the physical database for the original SELECT body";
        }
        List<String> lines = new ArrayList<>();
        for (DynamicDataModelService.ColumnInfo column : definition.columns()) {
            String line = "  " + definition.dialect().quoteIdentifier(column.physicalColumnName())
                    + " " + column.sqlType();
            if (!column.nullable() || column.primaryKey()) {
                line += " NOT NULL";
            }
            if (column.autoIncrement()) {
                line += " AUTO_INCREMENT";
            }
            if (column.primaryKey()) {
                line += " PRIMARY KEY";
            }
            lines.add(line);
        }
        return "CREATE TABLE " + qualifiedName + " (\n" + String.join(",\n", lines) + "\n);";
    }

    private String relationSql(String tenantId, String projectId, long objectId, DatabaseDialect dialect) {
        List<Map<String, Object>> relations = relationService.listRelations(tenantId, projectId, objectId);
        if (relations.isEmpty()) {
            return "";
        }
        List<String> statements = new ArrayList<>();
        for (Map<String, Object> relation : relations) {
            String relationName = stringValue(mapValue(relation, "RELATION_NAME"), "fk_" + mapValue(relation, "ID"));
            String parentTable = stringValue(mapValue(relation, "parentPhysicalTableName"),
                    stringValue(mapValue(relation, "parentTableName"), ""));
            String childTable = stringValue(mapValue(relation, "childPhysicalTableName"),
                    stringValue(mapValue(relation, "childTableName"), ""));
            String parentSchema = normalizeSchemaName(stringValue(mapValue(relation, "parentSchemaName"), ""));
            String childSchema = normalizeSchemaName(stringValue(mapValue(relation, "childSchemaName"), ""));
            String parentField = stringValue(mapValue(relation, "PARENT_FIELD"), "");
            String childField = stringValue(mapValue(relation, "CHILD_FIELD"), "");
            if (parentTable.isBlank() || childTable.isBlank() || parentField.isBlank() || childField.isBlank()) {
                continue;
            }
            statements.add("ALTER TABLE " + qualifiedName(dialect, childSchema, childTable)
                    + " ADD CONSTRAINT " + dialect.quoteIdentifier(relationName)
                    + " FOREIGN KEY (" + dialect.quoteIdentifier(childField) + ")"
                    + " REFERENCES " + qualifiedName(dialect, parentSchema, parentTable)
                    + " (" + dialect.quoteIdentifier(parentField) + ");");
        }
        return String.join("\n", statements);
    }

    private static Object mapValue(Map<String, Object> row, String key) {
        if (row.containsKey(key)) {
            return row.get(key);
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(key)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private PhysicalObject mutateManagedShape(ServerInfo server,
                                              PhysicalObject object,
                                              String tenantId,
                                              String projectId) {
        DatabaseDialect dialect = parseDialect(server.dbType());
        String password = cryptoUtil.decrypt(server.encryptedPassword());
        try (Connection connection = dsManager.createDatabaseConnection(
                server.host(), server.port(), server.dbType(), object.databaseName(), server.username(), password)) {
            if (!hasColumn(object, "TENANT_ID")) {
                execute(connection, "ALTER TABLE " + qualifiedName(dialect, object.schemaName(), object.physicalName())
                        + " ADD COLUMN " + dialect.quoteIdentifier("TENANT_ID") + " VARCHAR(255)");
                execute(connection, "UPDATE " + qualifiedName(dialect, object.schemaName(), object.physicalName())
                        + " SET " + dialect.quoteIdentifier("TENANT_ID") + " = '" + sqlLiteral(tenantId) + "'"
                        + " WHERE " + dialect.quoteIdentifier("TENANT_ID") + " IS NULL");
                tryExecute(connection, setNotNullSql(dialect, object, "TENANT_ID", "VARCHAR(255)"));
            }
            if (!hasColumn(object, "PROJECT_ID")) {
                execute(connection, "ALTER TABLE " + qualifiedName(dialect, object.schemaName(), object.physicalName())
                        + " ADD COLUMN " + dialect.quoteIdentifier("PROJECT_ID") + " VARCHAR(255)");
                execute(connection, "UPDATE " + qualifiedName(dialect, object.schemaName(), object.physicalName())
                        + " SET " + dialect.quoteIdentifier("PROJECT_ID") + " = '" + sqlLiteral(projectId) + "'"
                        + " WHERE " + dialect.quoteIdentifier("PROJECT_ID") + " IS NULL");
                tryExecute(connection, setNotNullSql(dialect, object, "PROJECT_ID", "VARCHAR(255)"));
            }
            if (object.primaryKeyColumns().isEmpty() && !hasColumn(object, "ID")) {
                execute(connection, addIdentityPrimaryKeySql(dialect, object, "ID"));
                if (dialect == DatabaseDialect.H2) {
                    tryExecute(connection, "ALTER TABLE " + qualifiedName(dialect, object.schemaName(), object.physicalName())
                            + " ADD PRIMARY KEY (" + dialect.quoteIdentifier("ID") + ")");
                }
            }
            String indexName = "IDX_" + sanitizeIndexPart(object.physicalName()) + "_SCOPE";
            if (!indexExists(connection, object, indexName)) {
                tryExecute(connection, "CREATE INDEX " + dialect.quoteIdentifier(indexName)
                        + " ON " + qualifiedName(dialect, object.schemaName(), object.physicalName())
                        + " (" + dialect.quoteIdentifier("TENANT_ID") + ", " + dialect.quoteIdentifier("PROJECT_ID") + ")");
            }
            DatabaseMetaData metaData = connection.getMetaData();
            CatalogPattern pattern = catalogPattern(dialect, connection, object.databaseName());
            return describeObject(metaData, pattern.catalog(), object.schemaName(), object.physicalName(), OBJECT_TABLE, object.databaseName())
                    .withDatabaseId(object.databaseId());
        } catch (SQLException e) {
            throw new IllegalStateException("托管物理表结构失败: " + object.physicalName() + " - " + e.getMessage(), e);
        }
    }

    private Map<String, Object> catalogPayload(ServerInfo server, List<PhysicalDatabase> databases) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("serverId", server.id());
        payload.put("serverName", server.serverName());
        payload.put("host", server.host());
        payload.put("port", server.port());
        payload.put("dbType", server.dbType());
        payload.put("databases", databases.stream().map(this::databasePayload).toList());
        return payload;
    }

    private Map<String, Object> databasePayload(PhysicalDatabase database) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("databaseName", database.databaseName());
        payload.put("databaseId", database.databaseId());
        payload.put("registered", database.databaseId() != null);
        Map<String, Map<String, Object>> schemas = new LinkedHashMap<>();
        List<Map<String, Object>> flatObjects = new ArrayList<>();
        for (PhysicalObject object : database.objects()) {
            String schemaKey = object.schemaName().isBlank() ? "" : object.schemaName();
            Map<String, Object> schema = schemas.computeIfAbsent(schemaKey, key -> {
                Map<String, Object> created = new LinkedHashMap<>();
                created.put("schemaName", key.isBlank() ? null : key);
                created.put("tables", new ArrayList<Map<String, Object>>());
                created.put("views", new ArrayList<Map<String, Object>>());
                return created;
            });
            Map<String, Object> objectPayload = objectPayload(object, database.databaseId());
            flatObjects.add(objectPayload);
            String bucket = OBJECT_VIEW.equals(object.objectType()) ? "views" : "tables";
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> list = (List<Map<String, Object>>) schema.get(bucket);
            list.add(objectPayload);
        }
        payload.put("schemas", new ArrayList<>(schemas.values()));
        payload.put("objects", flatObjects);
        payload.put("relations", database.foreignKeys().stream().map(this::foreignKeyPayload).toList());
        return payload;
    }

    private Map<String, Object> objectPayload(PhysicalObject object, Long databaseId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("databaseId", databaseId);
        payload.put("objectId", object.objectId());
        payload.put("objectType", object.objectType());
        payload.put("schemaName", object.schemaName().isBlank() ? null : object.schemaName());
        payload.put("physicalName", object.physicalName());
        payload.put("physicalTableName", object.physicalName());
        payload.put("logicalName", object.logicalName());
        payload.put("registered", object.objectId() != null);
        payload.put("readOnly", OBJECT_VIEW.equals(object.objectType()));
        payload.put("primaryKeyColumns", object.primaryKeyColumns());
        payload.put("columns", object.columns().stream().map(this::columnPayload).toList());
        Map<String, Object> key = new LinkedHashMap<>();
        key.put("databaseId", databaseId);
        key.put("objectType", object.objectType());
        key.put("schemaName", object.schemaName());
        key.put("physicalName", object.physicalName());
        payload.put("physicalObjectKey", key);
        return payload;
    }

    private Map<String, Object> columnPayload(PhysicalColumn column) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", column.columnName());
        payload.put("physicalColumnName", column.columnName());
        payload.put("type", dataTypeFromSqlType(column));
        payload.put("sqlType", sqlTypeFromColumn(column));
        payload.put("primaryKey", column.primaryKey());
        payload.put("autoIncrement", column.autoIncrement());
        payload.put("nullable", column.nullable());
        payload.put("ordinalPosition", column.ordinalPosition());
        payload.put("size", column.size());
        payload.put("scale", column.scale());
        payload.put("defaultValue", column.defaultValue());
        return payload;
    }

    private Map<String, Object> foreignKeyPayload(PhysicalForeignKey fk) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("relationName", fk.relationName());
        payload.put("parentSchemaName", fk.parentSchemaName().isBlank() ? null : fk.parentSchemaName());
        payload.put("parentTableName", fk.parentTableName());
        payload.put("parentColumnName", fk.parentColumnName());
        payload.put("childSchemaName", fk.childSchemaName().isBlank() ? null : fk.childSchemaName());
        payload.put("childTableName", fk.childTableName());
        payload.put("childColumnName", fk.childColumnName());
        return payload;
    }

    private ServerInfo loadServer(Long serverId, boolean isPlatformAdmin, String currentTenant) {
        if (serverId == null) {
            throw new IllegalArgumentException("serverId 不能为空");
        }
        try {
            ServerInfo server = jdbc.queryForObject("""
                SELECT ID, SERVER_NAME, HOST, PORT, DB_TYPE, USERNAME, PASSWORD, ISOLATION_MODE, TENANT_ID
                FROM DATA_SOURCE_SERVER
                WHERE ID = ?
                """, (rs, rowNum) -> new ServerInfo(
                    rs.getLong("ID"),
                    rs.getString("SERVER_NAME"),
                    rs.getString("HOST"),
                    rs.getInt("PORT"),
                    rs.getString("DB_TYPE"),
                    rs.getString("USERNAME"),
                    rs.getString("PASSWORD"),
                    rs.getString("ISOLATION_MODE"),
                    rs.getString("TENANT_ID")
            ), serverId);
            if (server == null) {
                throw new IllegalArgumentException("服务器不存在: " + serverId);
            }
            requireServerAccess(server, isPlatformAdmin, currentTenant);
            return server;
        } catch (EmptyResultDataAccessException e) {
            throw new IllegalArgumentException("服务器不存在: " + serverId);
        }
    }

    private void requireServerAccess(ServerInfo server, boolean isPlatformAdmin, String currentTenant) {
        if (isPlatformAdmin) {
            return;
        }
        if (DataIsolationMode.TENANT_SHARED.name().equals(server.isolationMode())) {
            return;
        }
        if (!Objects.equals(currentTenant, server.tenantId())) {
            throw new SecurityException("DATA_SOURCE_SERVER_ACCESS_DENIED");
        }
    }

    private List<String> listPhysicalDatabaseNames(ServerInfo server) {
        DatabaseDialect dialect = parseDialect(server.dbType());
        String password = cryptoUtil.decrypt(server.encryptedPassword());
        try (Connection conn = dsManager.createSingleConnection(server.host(), server.port(), server.dbType(), server.username(), password);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(databaseListSql(dialect))) {
            List<String> names = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            while (rs.next()) {
                String name = stringValue(rs.getString(1), null);
                if (name != null && isUserDatabaseName(dialect, name) && seen.add(name.toLowerCase(Locale.ROOT))) {
                    names.add(name);
                }
            }
            names.sort(String.CASE_INSENSITIVE_ORDER);
            return names;
        } catch (SQLException e) {
            throw new IllegalStateException("读取服务器数据库列表失败: " + e.getMessage(), e);
        }
    }

    private Long findRegisteredDatabaseId(String tenantId, String projectId, long serverId, String databaseName) {
        List<Object> args = new ArrayList<>(List.of(tenantId, tenantId, projectId, serverId, databaseName));
        List<Long> ids = jdbc.queryForList("""
            SELECT ID
            FROM DATA_SOURCE_DATABASE
            WHERE (ISOLATION_MODE = 'TENANT_SHARED'
                OR (ISOLATION_MODE IN ('TENANT_ISOLATED', 'PROJECT_SHARED') AND TENANT_ID = ?)
                OR (ISOLATION_MODE = 'PROJECT_ISOLATED' AND TENANT_ID = ? AND PROJECT_ID = ?))
              AND SERVER_ID = ?
              AND DATABASE_NAME = ?
            ORDER BY CASE ISOLATION_MODE
                WHEN 'TENANT_SHARED' THEN 0
                WHEN 'PROJECT_ISOLATED' THEN 1
                WHEN 'TENANT_ISOLATED' THEN 2
                WHEN 'PROJECT_SHARED' THEN 3
                ELSE 4 END, ID
            LIMIT 1
            """, Long.class, args.toArray());
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long findTenantSharedDatabaseId(long serverId, String databaseName) {
        List<Long> ids = jdbc.queryForList("""
            SELECT ID FROM DATA_SOURCE_DATABASE
            WHERE SERVER_ID = ? AND DATABASE_NAME = ? AND ISOLATION_MODE = 'TENANT_SHARED'
            ORDER BY ID LIMIT 1
            """, Long.class, serverId, databaseName);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private void mergeDuplicateDatabaseMetadata(long serverId,
                                                String databaseName,
                                                long canonicalDatabaseId,
                                                String tenantId,
                                                String projectId) {
        List<Long> duplicateDatabaseIds = jdbc.queryForList("""
            SELECT ID FROM DATA_SOURCE_DATABASE
            WHERE SERVER_ID = ? AND DATABASE_NAME = ? AND ID <> ?
            ORDER BY ID
            """, Long.class, serverId, databaseName, canonicalDatabaseId);
        if (duplicateDatabaseIds.isEmpty()) {
            return;
        }
        Timestamp now = Timestamp.from(Instant.now());
        for (Long duplicateDatabaseId : duplicateDatabaseIds) {
            List<Map<String, Object>> duplicateObjects = jdbc.queryForList("""
                SELECT ID, OBJECT_TYPE, SCHEMA_NAME, PHYSICAL_TABLE_NAME
                FROM DATA_MODEL_TABLE
                WHERE DATABASE_ID = ?
                ORDER BY ID
                """, duplicateDatabaseId);
            for (Map<String, Object> duplicateObject : duplicateObjects) {
                Long duplicateObjectId = readLong(duplicateObject.get("ID"));
                if (duplicateObjectId == null) {
                    continue;
                }
                Long canonicalObjectId = findCanonicalObjectId(canonicalDatabaseId, duplicateObject);
                if (canonicalObjectId == null) {
                    jdbc.update("""
                        UPDATE DATA_MODEL_TABLE
                        SET DATABASE_ID = ?, TENANT_ID = ?, PROJECT_ID = ?, ISOLATION_MODE = 'TENANT_SHARED',
                            STATUS = 'active', UPDATED_AT = ?
                        WHERE ID = ?
                        """, canonicalDatabaseId, tenantId, projectId, now, duplicateObjectId);
                    continue;
                }
                if (!Objects.equals(canonicalObjectId, duplicateObjectId)) {
                    mergeRelationReferences(duplicateObjectId, canonicalObjectId);
                    jdbc.update("""
                        UPDATE DATA_MODEL_TABLE
                        SET STATUS = 'merged', UPDATED_AT = ?
                        WHERE ID = ?
                        """, now, duplicateObjectId);
                }
            }
        }
    }

    private Long findCanonicalObjectId(long canonicalDatabaseId, Map<String, Object> duplicateObject) {
        String objectType = normalizeObjectType(stringValue(duplicateObject.get("OBJECT_TYPE"), OBJECT_TABLE));
        String schemaName = normalizeSchemaName(stringValue(duplicateObject.get("SCHEMA_NAME"), ""));
        String physicalName = stringValue(duplicateObject.get("PHYSICAL_TABLE_NAME"), "");
        List<Long> ids = jdbc.queryForList("""
            SELECT ID
            FROM DATA_MODEL_TABLE
            WHERE DATABASE_ID = ? AND OBJECT_TYPE = ? AND SCHEMA_NAME = ? AND PHYSICAL_TABLE_NAME = ?
            ORDER BY CASE STATUS WHEN 'active' THEN 0 ELSE 1 END, ID
            LIMIT 1
            """, Long.class, canonicalDatabaseId, objectType, schemaName, physicalName);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private void mergeRelationReferences(long duplicateTableId, long canonicalTableId) {
        List<Map<String, Object>> relations = jdbc.queryForList("""
            SELECT ID, PARENT_TABLE_ID, CHILD_TABLE_ID, PARENT_FIELD, CHILD_FIELD
            FROM DATA_MODEL_RELATION
            WHERE PARENT_TABLE_ID = ? OR CHILD_TABLE_ID = ?
            ORDER BY ID
            """, duplicateTableId, duplicateTableId);
        Timestamp now = Timestamp.from(Instant.now());
        for (Map<String, Object> relation : relations) {
            Long relationId = readLong(relation.get("ID"));
            Long parentTableId = readLong(relation.get("PARENT_TABLE_ID"));
            Long childTableId = readLong(relation.get("CHILD_TABLE_ID"));
            if (relationId == null || parentTableId == null || childTableId == null) {
                continue;
            }
            long mergedParentId = Objects.equals(parentTableId, duplicateTableId) ? canonicalTableId : parentTableId;
            long mergedChildId = Objects.equals(childTableId, duplicateTableId) ? canonicalTableId : childTableId;
            String parentField = stringValue(relation.get("PARENT_FIELD"), "");
            String childField = stringValue(relation.get("CHILD_FIELD"), "");
            if (relationExists(relationId, mergedParentId, mergedChildId, parentField, childField)) {
                jdbc.update("DELETE FROM DATA_MODEL_RELATION WHERE ID = ?", relationId);
                continue;
            }
            jdbc.update("""
                UPDATE DATA_MODEL_RELATION
                SET PARENT_TABLE_ID = ?, CHILD_TABLE_ID = ?, UPDATED_AT = ?
                WHERE ID = ?
                """, mergedParentId, mergedChildId, now, relationId);
        }
    }

    private boolean relationExists(long excludedRelationId,
                                   long parentTableId,
                                   long childTableId,
                                   String parentField,
                                   String childField) {
        Integer count = jdbc.queryForObject("""
            SELECT COUNT(*)
            FROM DATA_MODEL_RELATION
            WHERE ID <> ?
              AND PARENT_TABLE_ID = ?
              AND CHILD_TABLE_ID = ?
              AND PARENT_FIELD = ?
              AND CHILD_FIELD = ?
            """, Integer.class, excludedRelationId, parentTableId, childTableId, parentField, childField);
        return count != null && count > 0;
    }

    private Map<ObjectLookupKey, RegisteredObject> registeredObjects(String tenantId, String projectId, Long databaseId) {
        if (databaseId == null) {
            return Map.of();
        }
        List<Object> args = new ArrayList<>(List.of(tenantId, tenantId, projectId, databaseId));
        List<RegisteredObject> rows = jdbc.query("""
            SELECT ID, LOGICAL_TABLE_NAME, OBJECT_TYPE, SCHEMA_NAME, PHYSICAL_TABLE_NAME
            FROM DATA_MODEL_TABLE
            WHERE (ISOLATION_MODE = 'TENANT_SHARED'
                OR (ISOLATION_MODE IN ('TENANT_ISOLATED', 'PROJECT_SHARED') AND TENANT_ID = ?)
                OR (ISOLATION_MODE = 'PROJECT_ISOLATED' AND TENANT_ID = ? AND PROJECT_ID = ?))
              AND DATABASE_ID = ?
            """, (rs, rowNum) -> new RegisteredObject(
                    rs.getLong("ID"),
                    rs.getString("LOGICAL_TABLE_NAME"),
                    new ObjectLookupKey(rs.getString("OBJECT_TYPE"), normalizeSchemaName(rs.getString("SCHEMA_NAME")), rs.getString("PHYSICAL_TABLE_NAME"))
            ), args.toArray());
        Map<ObjectLookupKey, RegisteredObject> result = new LinkedHashMap<>();
        for (RegisteredObject row : rows) {
            result.put(row.key(), row);
        }
        return result;
    }

    private RegisteredObject findRegisteredObject(String tenantId, String projectId, Long databaseId, ObjectLookupKey key) {
        if (databaseId == null) {
            return null;
        }
        List<Object> args = new ArrayList<>(List.of(tenantId, tenantId, projectId, databaseId, key.objectType(), key.schemaName(), key.physicalName()));
        List<RegisteredObject> rows = jdbc.query("""
            SELECT ID, LOGICAL_TABLE_NAME, OBJECT_TYPE, SCHEMA_NAME, PHYSICAL_TABLE_NAME
            FROM DATA_MODEL_TABLE
            WHERE (ISOLATION_MODE = 'TENANT_SHARED'
                OR (ISOLATION_MODE IN ('TENANT_ISOLATED', 'PROJECT_SHARED') AND TENANT_ID = ?)
                OR (ISOLATION_MODE = 'PROJECT_ISOLATED' AND TENANT_ID = ? AND PROJECT_ID = ?))
              AND DATABASE_ID = ?
              AND OBJECT_TYPE = ?
              AND SCHEMA_NAME = ?
              AND PHYSICAL_TABLE_NAME = ?
            ORDER BY ID LIMIT 1
            """, (rs, rowNum) -> new RegisteredObject(
                    rs.getLong("ID"),
                    rs.getString("LOGICAL_TABLE_NAME"),
                    new ObjectLookupKey(rs.getString("OBJECT_TYPE"), normalizeSchemaName(rs.getString("SCHEMA_NAME")), rs.getString("PHYSICAL_TABLE_NAME"))
            ), args.toArray());
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String uniqueLogicalAlias(String tenantId, String projectId, String databaseName, String schemaName, String physicalName) {
        List<String> candidates = new ArrayList<>();
        candidates.add(toSafeAlias(physicalName));
        candidates.add(toSafeAlias(databaseName + "_" + physicalName));
        if (schemaName != null && !schemaName.isBlank()) {
            candidates.add(toSafeAlias(databaseName + "_" + schemaName + "_" + physicalName));
        }
        for (String candidate : candidates) {
            if (!candidate.isBlank() && !logicalAliasExists(tenantId, projectId, candidate)) {
                return candidate;
            }
        }
        String base = candidates.stream().filter(item -> !item.isBlank()).findFirst().orElse("dbmsObject");
        int suffix = 2;
        while (logicalAliasExists(tenantId, projectId, base + "_" + suffix)) {
            suffix++;
        }
        return base + "_" + suffix;
    }

    private boolean logicalAliasExists(String tenantId, String projectId, String alias) {
        Integer count = jdbc.queryForObject("""
            SELECT COUNT(*) FROM DATA_MODEL_TABLE
            WHERE TENANT_ID = ? AND PROJECT_ID = ? AND LOGICAL_TABLE_NAME = ?
            """, Integer.class, tenantId, projectId, alias);
        return count != null && count > 0;
    }

    private static String databaseListSql(DatabaseDialect dialect) {
        return switch (dialect) {
            case MYSQL -> "SHOW DATABASES";
            case POSTGRESQL -> "SELECT datname FROM pg_database WHERE datallowconn = true AND datistemplate = false ORDER BY datname";
            case H2 -> "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME";
        };
    }

    private static boolean isUserDatabaseName(DatabaseDialect dialect, String databaseName) {
        String normalized = databaseName.toLowerCase(Locale.ROOT);
        return switch (dialect) {
            case MYSQL -> !MYSQL_SYSTEM_DATABASES.contains(normalized);
            case POSTGRESQL -> !Set.of("template0", "template1", "postgres").contains(normalized);
            case H2 -> !Set.of("information_schema", "public").contains(normalized);
        };
    }

    private static CatalogPattern catalogPattern(DatabaseDialect dialect, Connection connection, String databaseName) throws SQLException {
        return switch (dialect) {
            case H2 -> new CatalogPattern(connection.getCatalog(), databaseName);
            case MYSQL -> new CatalogPattern(databaseName, null);
            case POSTGRESQL -> new CatalogPattern(connection.getCatalog(), null);
        };
    }

    private static boolean isUserObject(DatabaseDialect dialect, String schemaName, String objectName) {
        if (objectName == null || objectName.isBlank()) {
            return false;
        }
        String upperName = objectName.toUpperCase(Locale.ROOT);
        if (upperName.startsWith("SYS") || upperName.startsWith("DATA_MODEL_")
                || upperName.startsWith("DATA_SOURCE_") || upperName.startsWith("DATA_BATCH_")
                || upperName.startsWith("FLYWAY_SCHEMA_HISTORY")) {
            return false;
        }
        String schema = schemaName == null ? "" : schemaName.toLowerCase(Locale.ROOT);
        if (dialect == DatabaseDialect.POSTGRESQL && POSTGRES_SYSTEM_SCHEMAS.contains(schema)) {
            return false;
        }
        return dialect != DatabaseDialect.H2 || !"information_schema".equals(schema);
    }

    private static DatabaseDialect parseDialect(String dbType) {
        if (dbType == null) return DatabaseDialect.MYSQL;
        return switch (dbType.toLowerCase(Locale.ROOT)) {
            case "mysql" -> DatabaseDialect.MYSQL;
            case "postgresql", "postgres" -> DatabaseDialect.POSTGRESQL;
            case "h2" -> DatabaseDialect.H2;
            default -> DatabaseDialect.MYSQL;
        };
    }

    private static String normalizeObjectType(String value) {
        if (value == null) return OBJECT_TABLE;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        return normalized.contains("VIEW") ? OBJECT_VIEW : OBJECT_TABLE;
    }

    private static String normalizeSchemaName(String value) {
        return value == null ? "" : value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static boolean booleanValue(Object value, boolean defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Boolean bool) return bool;
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private static String stringValue(Object value, String defaultValue) {
        if (value == null) return defaultValue;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? defaultValue : text;
    }

    private static List<String> readDatabaseNames(Object value) {
        if (!(value instanceof List<?> raw)) {
            return List.of();
        }
        return raw.stream()
                .map(item -> stringValue(item, null))
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private static Set<PhysicalObjectKey> readMutateKeys(Object value) {
        if (!(value instanceof List<?> raw)) {
            return Set.of();
        }
        Set<PhysicalObjectKey> keys = new LinkedHashSet<>();
        for (Object item : raw) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            Long databaseId = readLong(map.get("databaseId"));
            String objectType = normalizeObjectType(stringValue(map.get("objectType"), OBJECT_TABLE));
            String schemaName = normalizeSchemaName(stringValue(map.get("schemaName"), ""));
            String physicalName = stringValue(map.get("physicalName"), null);
            if (databaseId != null && physicalName != null) {
                keys.add(new PhysicalObjectKey(databaseId, objectType, schemaName, physicalName));
            }
        }
        return keys;
    }

    private static Long readLong(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text && !text.isBlank()) return Long.parseLong(text.trim());
        return null;
    }

    private static String dataTypeFromSqlType(PhysicalColumn column) {
        return switch (column.sqlTypeCode()) {
            case Types.INTEGER, Types.SMALLINT, Types.TINYINT -> "integer";
            case Types.BIGINT, Types.NUMERIC, Types.DECIMAL, Types.DOUBLE, Types.FLOAT, Types.REAL -> "number";
            case Types.BOOLEAN, Types.BIT -> "boolean";
            case Types.DATE -> "date";
            case Types.TIMESTAMP, Types.TIMESTAMP_WITH_TIMEZONE -> "datetime";
            case Types.TIME, Types.TIME_WITH_TIMEZONE -> "time";
            case Types.CLOB, Types.LONGVARCHAR, Types.LONGNVARCHAR -> "text";
            default -> "string";
        };
    }

    private static String sqlTypeFromColumn(PhysicalColumn column) {
        String type = column.typeName() == null ? "VARCHAR" : column.typeName().toUpperCase(Locale.ROOT);
        if ((type.contains("CHAR") || type.contains("VARCHAR")) && column.size() != null && column.size() > 0) {
            return "VARCHAR(" + column.size() + ")";
        }
        if ((type.contains("DECIMAL") || type.contains("NUMERIC")) && column.size() != null && column.scale() != null) {
            return "DECIMAL(" + column.size() + "," + column.scale() + ")";
        }
        if (type.contains("IDENTITY")) return "BIGINT";
        return type.replace(" CHARACTER VARYING", "VARCHAR");
    }

    private static String humanizeLabel(String physicalName) {
        if (physicalName == null || physicalName.isBlank()) return "";
        return physicalName.replace('_', ' ');
    }

    private static String hashObject(PhysicalObject object) {
        StringBuilder builder = new StringBuilder(object.objectType()).append('|')
                .append(object.schemaName()).append('|')
                .append(object.physicalName()).append('|');
        for (PhysicalColumn column : object.columns()) {
            builder.append(column.columnName()).append(':')
                    .append(column.typeName()).append(':')
                    .append(column.size()).append(':')
                    .append(column.scale()).append(':')
                    .append(column.nullable()).append(':')
                    .append(column.primaryKey()).append(';');
        }
        return sha256(builder.toString());
    }

    private static String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte b : bytes) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static String toSafeAlias(String value) {
        String alias = value == null ? "" : value.trim();
        if (SAFE_ALIAS.matcher(alias).matches()) {
            return alias;
        }
        alias = alias.replaceAll("[^A-Za-z0-9_]", "_");
        if (alias.isBlank()) return "";
        if (!Character.isLetter(alias.charAt(0)) && alias.charAt(0) != '_') {
            alias = "_" + alias;
        }
        return alias;
    }

    private static String qualifiedName(DatabaseDialect dialect, String schemaName, String tableName) {
        if (schemaName == null || schemaName.isBlank() || dialect == DatabaseDialect.MYSQL) {
            return dialect.quoteIdentifier(tableName);
        }
        return dialect.quoteIdentifier(schemaName) + "." + dialect.quoteIdentifier(tableName);
    }

    private static String setNotNullSql(DatabaseDialect dialect, PhysicalObject object, String columnName, String sqlType) {
        String table = qualifiedName(dialect, object.schemaName(), object.physicalName());
        return switch (dialect) {
            case MYSQL -> "ALTER TABLE " + table + " MODIFY COLUMN " + dialect.quoteIdentifier(columnName) + " " + sqlType + " NOT NULL";
            case POSTGRESQL, H2 -> "ALTER TABLE " + table + " ALTER COLUMN " + dialect.quoteIdentifier(columnName) + " SET NOT NULL";
        };
    }

    private static String addIdentityPrimaryKeySql(DatabaseDialect dialect, PhysicalObject object, String columnName) {
        String table = qualifiedName(dialect, object.schemaName(), object.physicalName());
        return switch (dialect) {
            case MYSQL -> "ALTER TABLE " + table + " ADD COLUMN " + dialect.quoteIdentifier(columnName) + " BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY";
            case POSTGRESQL -> "ALTER TABLE " + table + " ADD COLUMN " + dialect.quoteIdentifier(columnName) + " BIGSERIAL PRIMARY KEY";
            case H2 -> "ALTER TABLE " + table + " ADD COLUMN " + dialect.quoteIdentifier(columnName) + " BIGINT GENERATED BY DEFAULT AS IDENTITY";
        };
    }

    private static boolean hasColumn(PhysicalObject object, String columnName) {
        return object.columns().stream().anyMatch(column -> column.columnName().equalsIgnoreCase(columnName));
    }

    private static String sanitizeIndexPart(String text) {
        String normalized = text == null ? "OBJECT" : text.replaceAll("[^A-Za-z0-9_]", "_");
        return normalized.length() > 40 ? normalized.substring(0, 40) : normalized;
    }

    private static String sqlLiteral(String text) {
        return text == null ? "" : text.replace("'", "''");
    }

    private static boolean indexExists(Connection connection, PhysicalObject object, String indexName) throws SQLException {
        DatabaseMetaData metaData = connection.getMetaData();
        try (ResultSet rs = metaData.getIndexInfo(connection.getCatalog(), blankToNull(object.schemaName()), object.physicalName(), false, false)) {
            while (rs.next()) {
                String actual = rs.getString("INDEX_NAME");
                if (actual != null && actual.equalsIgnoreCase(indexName)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private static void tryExecute(Connection connection, String sql) {
        try {
            execute(connection, sql);
        } catch (SQLException ignored) {
            // Physical takeover remains conservative; catalog consistency exposes remaining differences.
        }
    }

    private static long generatedId(KeyHolder keyHolder) {
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("新增元数据后未返回主键");
        }
        return key.longValue();
    }

    private record ServerInfo(
            long id,
            String serverName,
            String host,
            int port,
            String dbType,
            String username,
            String encryptedPassword,
            String isolationMode,
            String tenantId
    ) {}

    private record CatalogPattern(String catalog, String schemaPattern) {}

    private record PhysicalDatabase(
            String databaseName,
            Long databaseId,
            List<PhysicalObject> objects,
            List<PhysicalForeignKey> foreignKeys
    ) {}

    private record PhysicalObject(
            String databaseName,
            Long databaseId,
            String objectType,
            String schemaName,
            String physicalName,
            List<PhysicalColumn> columns,
            Set<String> primaryKeyColumns,
            Long objectId,
            String logicalName
    ) {
        PhysicalObject withDatabaseId(Long newDatabaseId) {
            return new PhysicalObject(databaseName, newDatabaseId, objectType, schemaName, physicalName, columns, primaryKeyColumns, objectId, logicalName);
        }

        PhysicalObject withRegistration(Long newDatabaseId, Long newObjectId, String newLogicalName) {
            return new PhysicalObject(databaseName, newDatabaseId, objectType, schemaName, physicalName, columns, primaryKeyColumns, newObjectId, newLogicalName);
        }

        ObjectLookupKey lookupKey() {
            return new ObjectLookupKey(objectType, schemaName, physicalName);
        }

        PhysicalObjectKey toPhysicalObjectKey() {
            return new PhysicalObjectKey(databaseId, objectType, schemaName, physicalName);
        }
    }

    private record PhysicalColumn(
            String columnName,
            int sqlTypeCode,
            String typeName,
            Integer size,
            Integer scale,
            boolean nullable,
            String defaultValue,
            boolean primaryKey,
            boolean autoIncrement,
            int ordinalPosition
    ) {}

    private record PhysicalForeignKey(
            String parentSchemaName,
            String parentTableName,
            String parentColumnName,
            String childSchemaName,
            String childTableName,
            String childColumnName,
            String relationName
    ) {}

    private record ObjectLookupKey(String objectType, String schemaName, String physicalName) {
        ObjectLookupKey {
            objectType = normalizeObjectType(objectType);
            schemaName = normalizeSchemaName(schemaName);
        }
    }

    private record PhysicalObjectKey(Long databaseId, String objectType, String schemaName, String physicalName) {
        PhysicalObjectKey {
            objectType = normalizeObjectType(objectType);
            schemaName = normalizeSchemaName(schemaName);
        }
    }

    private record RegisteredObject(long id, String logicalName, ObjectLookupKey key) {}
}
