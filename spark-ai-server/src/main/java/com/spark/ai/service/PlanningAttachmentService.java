package com.spark.ai.service;

import com.spark.ai.config.PlanningAttachmentProperties;
import com.spark.ai.entity.PlanningAttachmentEntity;
import com.spark.ai.repository.PlanningAttachmentRepository;
import com.spark.ai.security.AccessGuardService;
import com.spark.ai.security.AuthenticatedRequestContext;
import org.apache.tika.exception.TikaException;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.metadata.TikaCoreProperties;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.xml.sax.SAXException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class PlanningAttachmentService {

    private static final String REF_PREFIX = "planning-attachment:";

    private final PlanningAttachmentRepository repository;
    private final PlanningAttachmentProperties properties;
    private final AccessGuardService accessGuard;
    private final Path storageRoot;

    public PlanningAttachmentService(
            PlanningAttachmentRepository repository,
            PlanningAttachmentProperties properties,
            AccessGuardService accessGuard) {
        this.repository = repository;
        this.properties = properties;
        this.accessGuard = accessGuard;
        this.storageRoot = Path.of(properties.getStorageDir()).toAbsolutePath().normalize();
    }

    @Transactional
    public PlanningAttachmentSummary uploadProjectPlanningAttachment(
            String tenantId,
            String projectId,
            MultipartFile file) throws IOException {
        AuthenticatedRequestContext ctx = accessGuard.requireProjectAdmin(tenantId, projectId);
        validateDocx(file);

        String attachmentId = UUID.randomUUID().toString();
        String attachmentRef = REF_PREFIX + attachmentId;
        String originalFilename = safeOriginalFilename(file.getOriginalFilename());
        Path relativePath = Path.of(tenantId, projectId, attachmentId, originalFilename);
        Path target = resolveStoragePath(relativePath.toString());
        Files.createDirectories(target.getParent());
        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target);
        }

        PlanningAttachmentEntity entity = new PlanningAttachmentEntity();
        entity.setAttachmentRef(attachmentRef);
        entity.setTenantId(tenantId);
        entity.setProjectId(projectId);
        entity.setOriginalFilename(originalFilename);
        entity.setContentType(file.getContentType());
        entity.setSizeBytes(file.getSize());
        entity.setStoragePath(relativePath.toString().replace('\\', '/'));
        if (ctx != null) {
            entity.setCreatedBy(ctx.username());
        }
        repository.save(entity);
        return PlanningAttachmentSummary.from(entity);
    }

    public PlanningAttachmentSummary readSummary(String attachmentRef) {
        return PlanningAttachmentSummary.from(findByRef(attachmentRef));
    }

    public String extractTextForPrompt(String tenantId, String projectId, String attachmentRef) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        PlanningAttachmentEntity entity = findByRefAndScope(tenantId, projectId, attachmentRef);
        return extractTextFromEntity(entity);
    }

    private String extractTextFromEntity(PlanningAttachmentEntity entity) {
        Path file = resolveStoragePath(entity.getStoragePath());
        if (!Files.isRegularFile(file)) {
            throw new NoSuchElementException("附件文件不存在: " + entity.getAttachmentRef());
        }
        BodyContentHandler handler = new BodyContentHandler(Math.max(1, properties.getMaxExtractChars()));
        try (InputStream input = Files.newInputStream(file)) {
            Metadata metadata = new Metadata();
            metadata.set(TikaCoreProperties.RESOURCE_NAME_KEY, entity.getOriginalFilename());
            new AutoDetectParser().parse(input, handler, metadata, new ParseContext());
            return handler.toString().trim();
        } catch (SAXException error) {
            String partial = handler.toString().trim();
            if (!partial.isBlank()) {
                return partial;
            }
            throw new IllegalStateException("附件解析失败: " + entity.getAttachmentRef() + " - " + error.getMessage(), error);
        } catch (IOException | TikaException error) {
            throw new IllegalStateException("附件解析失败: " + entity.getAttachmentRef() + " - " + error.getMessage(), error);
        }
    }

    private PlanningAttachmentEntity findByRef(String attachmentRef) {
        String normalized = normalizeAttachmentRef(attachmentRef);
        return repository.findByAttachmentRef(normalized)
                .orElseThrow(() -> new NoSuchElementException("策划附件不存在: " + normalized));
    }

    private PlanningAttachmentEntity findByRefAndScope(String tenantId, String projectId, String attachmentRef) {
        String normalized = normalizeAttachmentRef(attachmentRef);
        return repository.findByAttachmentRefAndTenantIdAndProjectId(normalized, tenantId, projectId)
                .orElseThrow(() -> new NoSuchElementException("策划附件不存在: " + normalized));
    }

    private void validateDocx(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("附件文件不能为空");
        }
        if (file.getSize() > properties.getMaxFileBytes()) {
            throw new IllegalArgumentException("附件超过大小限制: " + properties.getMaxFileBytes() + " bytes");
        }
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.toLowerCase().endsWith(".docx")) {
            throw new IllegalArgumentException("仅支持 .docx 项目策划文档");
        }
    }

    private String normalizeAttachmentRef(String attachmentRef) {
        if (attachmentRef == null || attachmentRef.isBlank()) {
            throw new IllegalArgumentException("planningAttachmentRef 不能为空");
        }
        String normalized = attachmentRef.trim();
        if (!normalized.startsWith(REF_PREFIX)) {
            throw new IllegalArgumentException("非法 planningAttachmentRef: " + normalized);
        }
        return normalized;
    }

    private Path resolveStoragePath(String storagePath) {
        Path resolved = storageRoot.resolve(storagePath).toAbsolutePath().normalize();
        if (!resolved.startsWith(storageRoot)) {
            throw new IllegalArgumentException("非法附件存储路径");
        }
        return resolved;
    }

    private static String safeOriginalFilename(String raw) {
        String name = raw == null || raw.isBlank() ? "planning-document.docx" : raw.trim();
        String safe = name.replace('\\', '_').replace('/', '_');
        return safe.isBlank() ? "planning-document.docx" : safe;
    }

    public record PlanningAttachmentSummary(
            String planningAttachmentRef,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String createdAt,
            String updatedAt) {
        static PlanningAttachmentSummary from(PlanningAttachmentEntity entity) {
            return new PlanningAttachmentSummary(
                    entity.getAttachmentRef(),
                    entity.getOriginalFilename(),
                    entity.getContentType(),
                    entity.getSizeBytes() != null ? entity.getSizeBytes() : 0L,
                    entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : null,
                    entity.getUpdatedAt() != null ? entity.getUpdatedAt().toString() : null);
        }

        public Map<String, Object> toMap() {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("planningAttachmentRef", planningAttachmentRef);
            result.put("originalFilename", originalFilename);
            result.put("contentType", contentType);
            result.put("sizeBytes", sizeBytes);
            result.put("createdAt", createdAt);
            result.put("updatedAt", updatedAt);
            return result;
        }
    }
}
