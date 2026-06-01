package com.spark.ai.repository;

import com.spark.ai.entity.NavigationNodeFlatEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NavigationNodeFlatRepository extends JpaRepository<NavigationNodeFlatEntity, String> {

    List<NavigationNodeFlatEntity> findByTenantIdAndProjectIdOrderByOrderAscNodeIdAsc(
            String tenantId, String projectId);

    Optional<NavigationNodeFlatEntity> findByTenantIdAndProjectIdAndNodeId(
            String tenantId, String projectId, String nodeId);

    List<NavigationNodeFlatEntity> findByNodeId(String nodeId);

    boolean existsByTenantIdAndProjectIdAndNodeId(String tenantId, String projectId, String nodeId);

    List<NavigationNodeFlatEntity> findByTenantIdAndProjectIdAndParentId(
            String tenantId, String projectId, String parentId);

    List<NavigationNodeFlatEntity> findByTenantIdAndProjectIdAndParentIdIsNull(
            String tenantId, String projectId);

    void deleteByTenantIdAndProjectId(String tenantId, String projectId);

    void deleteByTenantIdAndProjectIdAndNodeId(String tenantId, String projectId, String nodeId);

    @Query("""
            select coalesce(max(n.order), -1) + 1
            from NavigationNodeFlatEntity n
            where n.tenantId = :tenantId
              and n.projectId = :projectId
              and ((:parentId is null and n.parentId is null) or n.parentId = :parentId)
            """)
    Integer nextOrder(@Param("tenantId") String tenantId,
                      @Param("projectId") String projectId,
                      @Param("parentId") String parentId);

}
