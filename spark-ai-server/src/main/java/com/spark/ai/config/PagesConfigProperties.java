package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 页面配置文件目录配置。
 * spark.pages.config-dir 服务端独立管理的配置目录（默认 ./data/pages-config）。
 * spark.pages.seed-dir 种子目录，首次启动时从此处拷贝 demo 数据（默认 ../public/pages-config）。
 */
@ConfigurationProperties(prefix = "spark.pages")
public class PagesConfigProperties {

    /**
     * 服务端管理的 pages-config 目录路径。
     * 所有页面配置的读写都在此目录进行——生产与开发环境统一。
     * 可通过环境变量 PAGES_CONFIG_DIR 覆盖。
     */
    private String configDir = "./data/pages-config";

    /**
     * 种子数据目录。首次启动时若 configDir 为空，自动从 seedDir 拷贝初始数据。
     * 默认指向前端仓库的 public/pages-config（仅开发环境存在）。
     * 生产环境无需种子：configDir 由运维预先准备或通过 AI 生成。
     */
    private String seedDir = "../public/pages-config";

    public String getConfigDir() { return configDir; }
    public void setConfigDir(String configDir) { this.configDir = configDir; }

    public String getSeedDir() { return seedDir; }
    public void setSeedDir(String seedDir) { this.seedDir = seedDir; }
}
