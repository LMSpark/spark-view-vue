package com.spark.ai.repository;

import com.spark.ai.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<UserEntity, Long> {

    Optional<UserEntity> findByTenantIdAndUsername(String tenantId, String username);

    boolean existsByTenantIdAndUsername(String tenantId, String username);

    List<UserEntity> findByTenantId(String tenantId);

    long countByTenantId(String tenantId);
}
