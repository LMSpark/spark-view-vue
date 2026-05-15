package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 页面配置文件目录配置。
 * spark.pages.config-dir 指向 data/pages-config/（直接 git 跟踪，无需种子机制）。
 */
@ConfigurationProperties(prefix = "spark.pages")
public class PagesConfigProperties {

    /**
     * 服务端管理的 pages-config 目录路径。
     * 所有页面配置的读写都在此目录进行——生产与开发环境统一。
     * 可通过环境变量 PAGES_CONFIG_DIR 覆盖。
     */
    private String configDir = "./data/pages-config";
    private Storage storage = new Storage();

    public String getConfigDir() { return configDir; }
    public void setConfigDir(String configDir) { this.configDir = configDir; }

    public Storage getStorage() { return storage; }
    public void setStorage(Storage storage) { this.storage = storage; }

    public static class Storage {
        private String type = "file";
        private String gitRemote;
        private String s3Endpoint;
        private String s3Bucket;
        private String s3Region = "us-east-1";
        private String s3AccessKey;
        private String s3SecretKey;

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getGitRemote() { return gitRemote; }
        public void setGitRemote(String gitRemote) { this.gitRemote = gitRemote; }
        public String getS3Endpoint() { return s3Endpoint; }
        public void setS3Endpoint(String s3Endpoint) { this.s3Endpoint = s3Endpoint; }
        public String getS3Bucket() { return s3Bucket; }
        public void setS3Bucket(String s3Bucket) { this.s3Bucket = s3Bucket; }
        public String getS3Region() { return s3Region; }
        public void setS3Region(String s3Region) { this.s3Region = s3Region; }
        public String getS3AccessKey() { return s3AccessKey; }
        public void setS3AccessKey(String s3AccessKey) { this.s3AccessKey = s3AccessKey; }
        public String getS3SecretKey() { return s3SecretKey; }
        public void setS3SecretKey(String s3SecretKey) { this.s3SecretKey = s3SecretKey; }
    }
}
