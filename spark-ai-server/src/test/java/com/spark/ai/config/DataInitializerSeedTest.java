package com.spark.ai.config;

import com.spark.ai.entity.TenantConfigEntity;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.service.AuthService;
import com.spark.ai.service.ProjectService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DataInitializerSeedTest {

    @Mock
    private TenantConfigRepository tenantRepo;

    @Mock
    private ProjectService projectService;

    @Mock
    private AuthService authService;

    @Test
    void runSeedsPlatformAndDefaultTenantFields() throws Exception {
        when(tenantRepo.findById(ProjectService.PLATFORM_TENANT_ID)).thenReturn(Optional.empty());
        when(tenantRepo.findById("lmspark")).thenReturn(Optional.empty());
        when(tenantRepo.findByDeletedAtIsNull()).thenReturn(List.of());
        DataInitializer initializer = new DataInitializer(tenantRepo, projectService, authService);

        initializer.run();

        ArgumentCaptor<TenantConfigEntity> captor = ArgumentCaptor.forClass(TenantConfigEntity.class);
        verify(tenantRepo, times(2)).save(captor.capture());
        List<TenantConfigEntity> saved = captor.getAllValues();

        TenantConfigEntity platform = saved.stream()
                .filter(entity -> ProjectService.PLATFORM_TENANT_ID.equals(entity.getTenantId()))
                .findFirst()
                .orElseThrow();
        assertEquals("SPARK 平台", platform.getTenantName());
        assertEquals("PLATFORM", platform.getTenantCode());
        assertEquals("ACTIVE", platform.getStatus());
        assertNull(platform.getDeletedAt());
        assertEquals("/platform/dashboard", platform.getHomePath());
        assertEquals("/api", platform.getApiBaseUrl());
        assertEquals("info", platform.getLogLevel());
        assertTrue(platform.getEnableAi());
        assertTrue(platform.getEnableExport());

        TenantConfigEntity tenant = saved.stream()
                .filter(entity -> "lmspark".equals(entity.getTenantId()))
                .findFirst()
                .orElseThrow();
        assertEquals("领码SPARK", tenant.getTenantName());
        assertEquals("LMSPARK", tenant.getTenantCode());
        assertEquals("ACTIVE", tenant.getStatus());
        assertNull(tenant.getDeletedAt());
        assertEquals("/", tenant.getHomePath());
        assertEquals("/api", tenant.getApiBaseUrl());
        assertEquals("debug", tenant.getLogLevel());
        assertTrue(tenant.getEnableAi());
        assertTrue(tenant.getEnableExport());

        verify(projectService).ensureHomepage(ProjectService.PLATFORM_TENANT_ID);
        verify(projectService).ensureHomepage("lmspark");
        verify(authService).ensurePlatformAdminUser(ProjectService.PLATFORM_TENANT_ID, "admin", "admin123");
        verify(authService).ensureAdminUser("lmspark", "admin", "admin123");
    }

    @Test
    void runRepairsExistingDefaultTenantWithoutCreatingSoftwareProjects() throws Exception {
        TenantConfigEntity existing = new TenantConfigEntity();
        existing.setTenantId("lmspark");
        existing.setStatus("DISABLED");
        existing.setDeletedAt(Instant.parse("2024-01-01T00:00:00Z"));
        when(tenantRepo.findById(ProjectService.PLATFORM_TENANT_ID)).thenReturn(Optional.empty());
        when(tenantRepo.findById("lmspark")).thenReturn(Optional.of(existing));
        when(tenantRepo.findByDeletedAtIsNull()).thenReturn(List.of(existing));
        DataInitializer initializer = new DataInitializer(tenantRepo, projectService, authService);

        initializer.run();

        assertEquals("ACTIVE", existing.getStatus());
        assertNull(existing.getDeletedAt());
        assertEquals("领码SPARK", existing.getTenantName());
        verify(projectService, times(2)).ensureHomepage("lmspark");
        verify(projectService).ensureAllProjectNavigations("lmspark");
    }
}
