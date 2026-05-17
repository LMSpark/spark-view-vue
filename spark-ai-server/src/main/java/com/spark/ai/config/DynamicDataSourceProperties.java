package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "spark.datasource")
public class DynamicDataSourceProperties {

    private Mode mode = Mode.DIRECT;

    public Mode getMode() {
        return mode;
    }

    public void setMode(String mode) {
        if (mode == null || mode.isBlank()) {
            this.mode = Mode.DIRECT;
            return;
        }
        String normalized = mode.trim().replace('-', '_').toUpperCase();
        this.mode = Mode.valueOf(normalized);
    }

    public boolean isJtaJndiMode() {
        return mode == Mode.JTA_JNDI;
    }

    public enum Mode {
        DIRECT,
        JTA_JNDI
    }
}
