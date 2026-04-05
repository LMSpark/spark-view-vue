package com.spark.ai.repository;

import com.spark.ai.entity.FileVersionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FileVersionRepository extends JpaRepository<FileVersionEntity, Long> {

    /** 查询某文件的全部版本（按版本号倒序） */
    List<FileVersionEntity> findByTenantIdAndProjectIdAndPageIdAndFilenameOrderByVersionDesc(
            String tenantId, String projectId, String pageId, String filename);

    /** 查询某页面全部文件的全部版本（按文件名+版本号排序） */
    List<FileVersionEntity> findByTenantIdAndProjectIdAndPageIdOrderByFilenameAscVersionDesc(
            String tenantId, String projectId, String pageId);

    /** 查询某文件的当前版本 */
    Optional<FileVersionEntity> findByTenantIdAndProjectIdAndPageIdAndFilenameAndIsCurrentTrue(
            String tenantId, String projectId, String pageId, String filename);

    /** 查询某文件的指定版本 */
    Optional<FileVersionEntity> findByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
            String tenantId, String projectId, String pageId, String filename, int version);

    /** 查询某文件的最大版本号 */
    @Query("SELECT COALESCE(MAX(f.version), 0) FROM FileVersionEntity f " +
           "WHERE f.tenantId = :tenantId AND f.projectId = :projectId " +
           "AND f.pageId = :pageId AND f.filename = :filename")
    int findMaxVersion(@Param("tenantId") String tenantId,
                       @Param("projectId") String projectId,
                       @Param("pageId") String pageId,
                       @Param("filename") String filename);

    /** 清除某文件的所有 isCurrent 标记 */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE FileVersionEntity f SET f.isCurrent = false " +
           "WHERE f.tenantId = :tenantId AND f.projectId = :projectId " +
           "AND f.pageId = :pageId AND f.filename = :filename AND f.isCurrent = true")
    void clearCurrentFlag(@Param("tenantId") String tenantId,
                          @Param("projectId") String projectId,
                          @Param("pageId") String pageId,
                          @Param("filename") String filename);

    /** 删除某页面全部版本记录 */
    void deleteByTenantIdAndProjectIdAndPageId(
            String tenantId, String projectId, String pageId);

    /** 删除某文件的指定版本 */
    void deleteByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
            String tenantId, String projectId, String pageId, String filename, int version);

    /** 查询某页面所有文件的当前版本 */
    List<FileVersionEntity> findByTenantIdAndProjectIdAndPageIdAndIsCurrentTrue(
            String tenantId, String projectId, String pageId);
}
