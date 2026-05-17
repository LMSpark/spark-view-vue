package com.spark.ai.service;

import com.spark.ai.entity.TenantConfigEntity;
import com.spark.ai.entity.UserEntity;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
public class PlatformTenantService {

    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String STATUS_DISABLED = "DISABLED";

    private final TenantConfigRepository tenantRepo;
    private final UserRepository userRepo;
    private final ProjectService projectService;
    private final AuthService authService;

    public PlatformTenantService(TenantConfigRepository tenantRepo,
                                 UserRepository userRepo,
                                 ProjectService projectService,
                                 AuthService authService) {
        this.tenantRepo = tenantRepo;
        this.userRepo = userRepo;
        this.projectService = projectService;
        this.authService = authService;
    }

    public List<Map<String, Object>> listTenants() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (TenantConfigEntity entity : tenantRepo.findByDeletedAtIsNull()) {
            result.add(toPlatformMap(entity));
        }
        return result;
    }

    @Transactional
    public Map<String, Object> createTenant(Map<String, Object> body) {
        String tenantId = requireString(body, "tenantId");
        validateTenantId(tenantId);
        if (ProjectService.PLATFORM_TENANT_ID.equals(tenantId)) {
            throw new IllegalArgumentException("platform 是保留租户 ID");
        }
        if (tenantRepo.existsById(tenantId)) {
            throw new IllegalArgumentException("租户已存在: " + tenantId);
        }

        String tenantName = stringOrDefault(body.get("tenantName"), tenantId);
        String tenantCode = stringOrDefault(body.get("tenantCode"), tenantId.toUpperCase(Locale.ROOT));
        String adminUsername = stringOrDefault(body.get("adminUsername"), "admin");
        String adminPassword = stringOrDefault(body.get("adminPassword"), "admin123");
        if (adminPassword.length() < 6) {
            throw new IllegalArgumentException("管理员密码至少 6 位");
        }

        TenantConfigEntity entity = new TenantConfigEntity();
        entity.setTenantId(tenantId);
        entity.setTenantName(tenantName);
        entity.setTenantCode(tenantCode);
        entity.setStatus(STATUS_ACTIVE);
        entity.setLogo("");
        entity.setPrimaryColor(stringOrDefault(body.get("primaryColor"), "#409eff"));
        entity.setBorderRadius(stringOrDefault(body.get("borderRadius"), "4px"));
        entity.setHomePath("/");
        entity.setApiBaseUrl("/api");
        entity.setLogLevel("info");
        entity.setEnableAi(true);
        entity.setEnableExport(true);
        entity.setEnableOffline(false);
        tenantRepo.save(entity);

        projectService.ensureHomepage(tenantId);
        authService.ensureAdminUser(tenantId, adminUsername, adminPassword);
        return toPlatformMap(entity);
    }

    @Transactional
    public Map<String, Object> updateTenant(String tenantId, Map<String, Object> body) {
        TenantConfigEntity entity = requireTenant(tenantId);
        if (body.containsKey("tenantName")) entity.setTenantName(optionalString(body.get("tenantName")));
        if (body.containsKey("tenantCode")) entity.setTenantCode(optionalString(body.get("tenantCode")));
        if (body.containsKey("logo")) entity.setLogo(optionalString(body.get("logo")));
        if (body.containsKey("primaryColor")) entity.setPrimaryColor(optionalString(body.get("primaryColor")));
        if (body.containsKey("borderRadius")) entity.setBorderRadius(optionalString(body.get("borderRadius")));
        if (body.containsKey("homePath")) entity.setHomePath(optionalString(body.get("homePath")));
        if (body.containsKey("logLevel")) entity.setLogLevel(optionalString(body.get("logLevel")));
        tenantRepo.save(entity);
        return toPlatformMap(entity);
    }

    @Transactional
    public Map<String, Object> enableTenant(String tenantId) {
        TenantConfigEntity entity = requireTenant(tenantId);
        entity.setStatus(STATUS_ACTIVE);
        tenantRepo.save(entity);
        return toPlatformMap(entity);
    }

    @Transactional
    public Map<String, Object> disableTenant(String tenantId) {
        if (ProjectService.PLATFORM_TENANT_ID.equals(tenantId)) {
            throw new IllegalArgumentException("不能禁用 platform 租户");
        }
        TenantConfigEntity entity = requireTenant(tenantId);
        entity.setStatus(STATUS_DISABLED);
        tenantRepo.save(entity);
        return toPlatformMap(entity);
    }

    @Transactional
    public Map<String, Object> softDeleteTenant(String tenantId) {
        if (ProjectService.PLATFORM_TENANT_ID.equals(tenantId)) {
            throw new IllegalArgumentException("不能删除 platform 租户");
        }
        TenantConfigEntity entity = requireTenant(tenantId);
        entity.setStatus(STATUS_DISABLED);
        entity.setDeletedAt(Instant.now());
        tenantRepo.save(entity);
        return toPlatformMap(entity);
    }

    private TenantConfigEntity requireTenant(String tenantId) {
        return tenantRepo.findById(tenantId)
                .filter(entity -> entity.getDeletedAt() == null)
                .orElseThrow(() -> new NoSuchElementException("租户不存在: " + tenantId));
    }

    private Map<String, Object> toPlatformMap(TenantConfigEntity entity) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tenantId", entity.getTenantId());
        result.put("tenantName", nullToEmpty(entity.getTenantName()));
        result.put("tenantCode", nullToEmpty(entity.getTenantCode()));
        result.put("status", nullToEmpty(entity.getStatus()));
        result.put("deletedAt", entity.getDeletedAt() != null ? entity.getDeletedAt().toString() : null);
        result.put("defaultProjectId", ProjectService.HOMEPAGE_PROJECT_ID);
        result.put("adminUserName", resolveAdminUserName(entity.getTenantId()));
        result.put("homePath", nullToEmpty(entity.getHomePath()));
        result.put("createdAt", entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : null);
        result.put("updatedAt", entity.getUpdatedAt() != null ? entity.getUpdatedAt().toString() : null);
        return result;
    }

    private String resolveAdminUserName(String tenantId) {
        for (UserEntity user : userRepo.findByTenantId(tenantId)) {
            String roles = user.getRoles() == null ? "" : user.getRoles();
            if (List.of(roles.split(",")).stream().map(String::trim).anyMatch("admin"::equals)) {
                return user.getUsername();
            }
        }
        return "";
    }

    private static void validateTenantId(String tenantId) {
        if (!tenantId.matches("^[a-zA-Z][a-zA-Z0-9_-]{2,31}$")) {
            throw new IllegalArgumentException("租户 ID 须以字母开头，3-32 个字母/数字/下划线/连字符");
        }
    }

    private static String requireString(Map<String, Object> body, String fieldName) {
        String value = optionalString(body.get(fieldName));
        if (value == null) {
            throw new IllegalArgumentException(fieldName + " 不能为空");
        }
        return value;
    }

    private static String stringOrDefault(Object value, String defaultValue) {
        String text = optionalString(value);
        return text != null ? text : defaultValue;
    }

    private static String optionalString(Object value) {
        if (value == null) return null;
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
