package com.spark.ai.repository;

import com.spark.ai.entity.PageConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PageConfigRepository extends JpaRepository<PageConfigEntity, String> {

    List<PageConfigEntity> findAllByOrderByCreatedAtAsc();
}
