package com.spark.ai.storage;

import java.io.IOException;
import java.util.List;

public interface PageConfigStorage {
    String type();

    boolean pageFileExists(String tenantId, String projectId, String pageId, String filename) throws IOException;

    String readPageFile(String tenantId, String projectId, String pageId, String filename) throws IOException;

    void writePageFile(String tenantId, String projectId, String pageId, String filename, String content) throws IOException;

    boolean deletePageFile(String tenantId, String projectId, String pageId, String filename) throws IOException;

    long pageFileTimestamp(String tenantId, String projectId, String pageId, String filename) throws IOException;

    boolean rootFileExists(String tenantId, String projectId, String filename) throws IOException;

    String readRootFile(String tenantId, String projectId, String filename) throws IOException;

    void writeRootFile(String tenantId, String projectId, String filename, String content) throws IOException;

    long rootFileTimestamp(String tenantId, String projectId, String filename) throws IOException;

    List<String> listPageIds(String tenantId, String projectId) throws IOException;

    List<String> listPageFiles(String tenantId, String projectId, String pageId) throws IOException;

    List<String> deletePage(String tenantId, String projectId, String pageId) throws IOException;
}
