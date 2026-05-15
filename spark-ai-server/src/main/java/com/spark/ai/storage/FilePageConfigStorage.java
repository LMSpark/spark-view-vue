package com.spark.ai.storage;

import com.spark.ai.config.PagesConfigProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Component
@ConditionalOnProperty(prefix = "spark.pages.storage", name = "type", havingValue = "file", matchIfMissing = true)
public class FilePageConfigStorage implements PageConfigStorage {

    private final Path root;

    public FilePageConfigStorage(PagesConfigProperties properties) {
        this.root = Path.of(properties.getConfigDir());
    }

    public FilePageConfigStorage(Path root) {
        this.root = root;
    }

    @Override
    public String type() {
        return "file";
    }

    @Override
    public boolean pageFileExists(String tenantId, String projectId, String pageId, String filename) {
        return Files.isRegularFile(pageFile(tenantId, projectId, pageId, filename));
    }

    @Override
    public String readPageFile(String tenantId, String projectId, String pageId, String filename) throws IOException {
        return Files.readString(pageFile(tenantId, projectId, pageId, filename), StandardCharsets.UTF_8);
    }

    @Override
    public void writePageFile(String tenantId, String projectId, String pageId, String filename, String content) throws IOException {
        Path file = pageFile(tenantId, projectId, pageId, filename);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    @Override
    public boolean deletePageFile(String tenantId, String projectId, String pageId, String filename) throws IOException {
        return Files.deleteIfExists(pageFile(tenantId, projectId, pageId, filename));
    }

    @Override
    public long pageFileTimestamp(String tenantId, String projectId, String pageId, String filename) throws IOException {
        return Files.getLastModifiedTime(pageFile(tenantId, projectId, pageId, filename)).toMillis();
    }

    @Override
    public boolean rootFileExists(String tenantId, String projectId, String filename) {
        return Files.isRegularFile(rootFile(tenantId, projectId, filename));
    }

    @Override
    public String readRootFile(String tenantId, String projectId, String filename) throws IOException {
        return Files.readString(rootFile(tenantId, projectId, filename), StandardCharsets.UTF_8);
    }

    @Override
    public void writeRootFile(String tenantId, String projectId, String filename, String content) throws IOException {
        Path file = rootFile(tenantId, projectId, filename);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    @Override
    public long rootFileTimestamp(String tenantId, String projectId, String filename) throws IOException {
        return Files.getLastModifiedTime(rootFile(tenantId, projectId, filename)).toMillis();
    }

    @Override
    public List<String> listPageIds(String tenantId, String projectId) throws IOException {
        Path project = projectDir(tenantId, projectId);
        if (!Files.isDirectory(project)) {
            return List.of();
        }
        List<String> pageIds = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(project)) {
            for (Path child : stream) {
                if (Files.isDirectory(child)) {
                    pageIds.add(child.getFileName().toString());
                }
            }
        }
        pageIds.sort(String::compareTo);
        return pageIds;
    }

    @Override
    public List<String> listPageFiles(String tenantId, String projectId, String pageId) throws IOException {
        Path dir = pageDir(tenantId, projectId, pageId);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        List<String> files = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path child : stream) {
                if (Files.isRegularFile(child)) {
                    files.add(child.getFileName().toString());
                }
            }
        }
        files.sort(String::compareTo);
        return files;
    }

    @Override
    public List<String> deletePage(String tenantId, String projectId, String pageId) throws IOException {
        Path dir = pageDir(tenantId, projectId, pageId);
        List<String> deleted = new ArrayList<>();
        if (!Files.isDirectory(dir)) {
            return deleted;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                if (!path.equals(dir)) {
                    deleted.add(dir.relativize(path).toString().replace('\\', '/'));
                }
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
        return deleted;
    }

    private Path projectDir(String tenantId, String projectId) {
        return root.resolve(tenantId).resolve(projectId);
    }

    private Path pageDir(String tenantId, String projectId, String pageId) {
        return projectDir(tenantId, projectId).resolve(pageId);
    }

    private Path pageFile(String tenantId, String projectId, String pageId, String filename) {
        return pageDir(tenantId, projectId, pageId).resolve(filename);
    }

    private Path rootFile(String tenantId, String projectId, String filename) {
        return projectDir(tenantId, projectId).resolve(filename);
    }
}
