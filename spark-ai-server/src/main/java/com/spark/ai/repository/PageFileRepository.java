package com.spark.ai.repository;

import com.spark.ai.entity.PageFileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PageFileRepository extends JpaRepository<PageFileEntity, Long> {

    Optional<PageFileEntity> findByPageIdAndFilename(String pageId, String filename);

    List<PageFileEntity> findByPageId(String pageId);

    void deleteByPageId(String pageId);
}
