package com.spark.ai.storage;

import com.spark.ai.config.PagesConfigProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.NoSuchFileException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@Component
@ConditionalOnProperty(prefix = "spark.pages.storage", name = "type", havingValue = "s3")
public class S3PageConfigStorage implements PageConfigStorage {

    private static final String ROOT_PAGE_ID = "__root__";

    private final S3Client s3;
    private final String bucket;

    public S3PageConfigStorage(PagesConfigProperties properties) {
        PagesConfigProperties.Storage config = properties.getStorage();
        if (config.getS3Bucket() == null || config.getS3Bucket().isBlank()) {
            throw new IllegalStateException("spark.pages.storage.s3-bucket is required when storage.type=s3");
        }
        this.bucket = config.getS3Bucket();
        S3ClientBuilder builder = S3Client.builder()
                .region(Region.of(config.getS3Region() != null ? config.getS3Region() : "us-east-1"))
                .forcePathStyle(true);
        if (config.getS3Endpoint() != null && !config.getS3Endpoint().isBlank()) {
            builder.endpointOverride(URI.create(config.getS3Endpoint()));
        }
        if (config.getS3AccessKey() != null && !config.getS3AccessKey().isBlank()
                && config.getS3SecretKey() != null && !config.getS3SecretKey().isBlank()) {
            builder.credentialsProvider(StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(config.getS3AccessKey(), config.getS3SecretKey())));
        } else {
            builder.credentialsProvider(DefaultCredentialsProvider.create());
        }
        this.s3 = builder.build();
    }

    @Override
    public String type() {
        return "s3";
    }

    @Override
    public boolean pageFileExists(String tenantId, String projectId, String pageId, String filename) {
        return exists(key(tenantId, projectId, pageId, filename));
    }

    @Override
    public String readPageFile(String tenantId, String projectId, String pageId, String filename) throws IOException {
        return readObject(key(tenantId, projectId, pageId, filename));
    }

    @Override
    public void writePageFile(String tenantId, String projectId, String pageId, String filename, String content) {
        writeObject(key(tenantId, projectId, pageId, filename), content);
    }

    @Override
    public boolean deletePageFile(String tenantId, String projectId, String pageId, String filename) {
        String key = key(tenantId, projectId, pageId, filename);
        boolean existed = exists(key);
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        return existed;
    }

    @Override
    public long pageFileTimestamp(String tenantId, String projectId, String pageId, String filename) throws IOException {
        return timestamp(key(tenantId, projectId, pageId, filename));
    }

    @Override
    public boolean rootFileExists(String tenantId, String projectId, String filename) {
        return pageFileExists(tenantId, projectId, ROOT_PAGE_ID, filename);
    }

    @Override
    public String readRootFile(String tenantId, String projectId, String filename) throws IOException {
        return readPageFile(tenantId, projectId, ROOT_PAGE_ID, filename);
    }

    @Override
    public void writeRootFile(String tenantId, String projectId, String filename, String content) {
        writePageFile(tenantId, projectId, ROOT_PAGE_ID, filename, content);
    }

    @Override
    public long rootFileTimestamp(String tenantId, String projectId, String filename) throws IOException {
        return pageFileTimestamp(tenantId, projectId, ROOT_PAGE_ID, filename);
    }

    @Override
    public List<String> listPageIds(String tenantId, String projectId) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        String prefix = tenantId + "/" + projectId + "/";
        for (S3Object object : listObjects(prefix)) {
            String suffix = object.key().substring(prefix.length());
            int slash = suffix.indexOf('/');
            if (slash <= 0) {
                continue;
            }
            String pageId = suffix.substring(0, slash);
            if (!ROOT_PAGE_ID.equals(pageId)) {
                ids.add(pageId);
            }
        }
        return new ArrayList<>(ids);
    }

    @Override
    public List<String> listPageFiles(String tenantId, String projectId, String pageId) {
        String prefix = tenantId + "/" + projectId + "/" + pageId + "/";
        List<String> files = new ArrayList<>();
        for (S3Object object : listObjects(prefix)) {
            String suffix = object.key().substring(prefix.length());
            if (!suffix.isBlank() && !suffix.contains("/")) {
                files.add(suffix);
            }
        }
        files.sort(String::compareTo);
        return files;
    }

    @Override
    public List<String> deletePage(String tenantId, String projectId, String pageId) {
        String prefix = tenantId + "/" + projectId + "/" + pageId + "/";
        List<String> deleted = new ArrayList<>();
        for (S3Object object : listObjects(prefix)) {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(object.key()).build());
            deleted.add(object.key().substring(prefix.length()));
        }
        return deleted;
    }

    private boolean exists(String key) {
        try {
            s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return true;
        } catch (NoSuchKeyException error) {
            return false;
        } catch (S3Exception error) {
            if (error.statusCode() == 404) {
                return false;
            }
            throw error;
        }
    }

    private String readObject(String key) throws IOException {
        try {
            byte[] bytes = s3.getObject(
                    GetObjectRequest.builder().bucket(bucket).key(key).build(),
                    ResponseTransformer.toBytes()).asByteArray();
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (NoSuchKeyException error) {
            throw new NoSuchFileException(key);
        } catch (S3Exception error) {
            if (error.statusCode() == 404) {
                throw new NoSuchFileException(key);
            }
            throw error;
        }
    }

    private void writeObject(String key, String content) {
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType("application/json; charset=utf-8")
                        .build(),
                RequestBody.fromString(content != null ? content : "", StandardCharsets.UTF_8));
    }

    private long timestamp(String key) throws IOException {
        try {
            return s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
                    .lastModified()
                    .toEpochMilli();
        } catch (NoSuchKeyException error) {
            throw new NoSuchFileException(key);
        } catch (S3Exception error) {
            if (error.statusCode() == 404) {
                throw new NoSuchFileException(key);
            }
            throw error;
        }
    }

    private List<S3Object> listObjects(String prefix) {
        List<S3Object> result = new ArrayList<>();
        String token = null;
        do {
            var response = s3.listObjectsV2(ListObjectsV2Request.builder()
                    .bucket(bucket)
                    .prefix(prefix)
                    .continuationToken(token)
                    .build());
            result.addAll(response.contents());
            token = response.nextContinuationToken();
        } while (token != null);
        return result;
    }

    private String key(String tenantId, String projectId, String pageId, String filename) {
        return tenantId + "/" + projectId + "/" + pageId + "/" + filename;
    }
}
