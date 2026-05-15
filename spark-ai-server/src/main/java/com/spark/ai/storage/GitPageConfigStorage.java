package com.spark.ai.storage;

import com.spark.ai.config.PagesConfigProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
@ConditionalOnProperty(prefix = "spark.pages.storage", name = "type", havingValue = "git")
public class GitPageConfigStorage extends FilePageConfigStorage {

    private static final Logger log = LoggerFactory.getLogger(GitPageConfigStorage.class);
    private final Path repoRoot;

    public GitPageConfigStorage(PagesConfigProperties properties) throws IOException {
        super(properties);
        this.repoRoot = Path.of(properties.getConfigDir());
        Files.createDirectories(repoRoot);
        runGit("init");
    }

    @Override
    public String type() {
        return "git";
    }

    @Override
    public void writePageFile(String tenantId, String projectId, String pageId, String filename, String content) throws IOException {
        super.writePageFile(tenantId, projectId, pageId, filename, content);
        commit("page-config write " + tenantId + "/" + projectId + "/" + pageId + "/" + filename);
    }

    @Override
    public void writeRootFile(String tenantId, String projectId, String filename, String content) throws IOException {
        super.writeRootFile(tenantId, projectId, filename, content);
        commit("page-config write " + tenantId + "/" + projectId + "/" + filename);
    }

    @Override
    public java.util.List<String> deletePage(String tenantId, String projectId, String pageId) throws IOException {
        java.util.List<String> deleted = super.deletePage(tenantId, projectId, pageId);
        commit("page-config delete " + tenantId + "/" + projectId + "/" + pageId);
        return deleted;
    }

    private void commit(String message) {
        try {
            runGit("add", ".");
            runGit("commit", "-m", message);
        } catch (IOException e) {
            log.warn("[PageConfigStorage:git] commit skipped: {}", e.getMessage());
        }
    }

    private void runGit(String... args) throws IOException {
        try {
            String[] command = new String[args.length + 1];
            command[0] = "git";
            System.arraycopy(args, 0, command, 1, args.length);
            Process process = new ProcessBuilder(command)
                    .directory(repoRoot.toFile())
                    .redirectErrorStream(true)
                    .start();
            int code = process.waitFor();
            if (code != 0) {
                throw new IOException("git " + String.join(" ", args) + " exited " + code);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("git interrupted", e);
        }
    }
}
