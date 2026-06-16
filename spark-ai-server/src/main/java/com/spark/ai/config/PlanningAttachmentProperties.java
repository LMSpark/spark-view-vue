package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 项目策划附件存储配置。
 */
@ConfigurationProperties(prefix = "spark.planning-attachments")
public class PlanningAttachmentProperties {

    /** 原始附件文件存储根目录。 */
    private String storageDir = "./data/planning-attachments";

    /** 单个附件最大字节数，默认 20 MB。 */
    private long maxFileBytes = 20L * 1024L * 1024L;

    /** 注入 LLM prompt 的最大正文字符数。 */
    private int maxExtractChars = 120_000;

    public String getStorageDir() { return storageDir; }
    public void setStorageDir(String storageDir) { this.storageDir = storageDir; }

    public long getMaxFileBytes() { return maxFileBytes; }
    public void setMaxFileBytes(long maxFileBytes) { this.maxFileBytes = maxFileBytes; }

    public int getMaxExtractChars() { return maxExtractChars; }
    public void setMaxExtractChars(int maxExtractChars) { this.maxExtractChars = maxExtractChars; }
}
