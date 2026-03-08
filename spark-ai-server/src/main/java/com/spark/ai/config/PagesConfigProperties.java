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

    public String getConfigDir() { return configDir; }
    public void setConfigDir(String configDir) { this.configDir = configDir; }
}
