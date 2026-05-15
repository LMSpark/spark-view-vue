package com.spark.ai.storage;

import com.spark.ai.entity.PageConfigFileEntity;
import com.spark.ai.repository.PageConfigFileRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.NoSuchFileException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@Component
@ConditionalOnProperty(prefix = "spark.pages.storage", name = "type", havingValue = "database")
public class DatabasePageConfigStorage implements PageConfigStorage {

    private final PageConfigFileRepository repository;

    public DatabasePageConfigStorage(PageConfigFileRepository repository) {
        this.repository = repository;
    }

    @Override
    public String type() {
        return "database";
    }

    @Override
    public boolean pageFileExists(String tenantId, String projectId, String pageId, String filename) {
        return repository.existsByTenantIdAndProjectIdAndPageIdAndFilename(tenantId, projectId, pageId, filename);
    }

    @Override
    public String readPageFile(String tenantId, String projectId, String pageId, String filename) throws NoSuchFileException {
        return find(tenantId, projectId, pageId, filename).getContent();
    }

    @Override
    @Transactional
    public void writePageFile(String tenantId, String projectId, String pageId, String filename, String content) {
        PageConfigFileEntity entity = repository.findByTenantIdAndProjectIdAndPageIdAndFilename(
                tenantId, projectId, pageId, filename).orElseGet(PageConfigFileEntity::new);
        entity.setTenantId(tenantId);
        entity.setProjectId(projectId);
        entity.setPageId(pageId);
        entity.setFilename(filename);
        entity.setContent(content);
        repository.save(entity);
    }

    @Override
    @Transactional
    public boolean deletePageFile(String tenantId, String projectId, String pageId, String filename) {
        return repository.findByTenantIdAndProjectIdAndPageIdAndFilename(tenantId, projectId, pageId, filename)
                .map(entity -> {
                    repository.delete(entity);
                    return true;
                })
                .orElse(false);
    }

    @Override
    public long pageFileTimestamp(String tenantId, String projectId, String pageId, String filename) throws NoSuchFileException {
        return find(tenantId, projectId, pageId, filename).getUpdatedAt().toEpochMilli();
    }

    @Override
    public boolean rootFileExists(String tenantId, String projectId, String filename) {
        return pageFileExists(tenantId, projectId, PageConfigFileEntity.ROOT_PAGE_ID, filename);
    }

    @Override
    public String readRootFile(String tenantId, String projectId, String filename) throws NoSuchFileException {
        return readPageFile(tenantId, projectId, PageConfigFileEntity.ROOT_PAGE_ID, filename);
    }

    @Override
    public void writeRootFile(String tenantId, String projectId, String filename, String content) {
        writePageFile(tenantId, projectId, PageConfigFileEntity.ROOT_PAGE_ID, filename, content);
    }

    @Override
    public long rootFileTimestamp(String tenantId, String projectId, String filename) throws NoSuchFileException {
        return pageFileTimestamp(tenantId, projectId, PageConfigFileEntity.ROOT_PAGE_ID, filename);
    }

    @Override
    public List<String> listPageIds(String tenantId, String projectId) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (PageConfigFileEntity entity : repository.findByTenantIdAndProjectId(tenantId, projectId)) {
            if (!PageConfigFileEntity.ROOT_PAGE_ID.equals(entity.getPageId())) {
                ids.add(entity.getPageId());
            }
        }
        return new ArrayList<>(ids);
    }

    @Override
    public List<String> listPageFiles(String tenantId, String projectId, String pageId) {
        return repository.findByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId)
                .stream()
                .map(PageConfigFileEntity::getFilename)
                .sorted()
                .toList();
    }

    @Override
    @Transactional
    public List<String> deletePage(String tenantId, String projectId, String pageId) {
        List<String> files = listPageFiles(tenantId, projectId, pageId);
        repository.deleteByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId);
        return files;
    }

    private PageConfigFileEntity find(String tenantId, String projectId, String pageId, String filename) throws NoSuchFileException {
        return repository.findByTenantIdAndProjectIdAndPageIdAndFilename(tenantId, projectId, pageId, filename)
                .orElseThrow(() -> new NoSuchFileException(pageId + "/" + filename));
    }
}
