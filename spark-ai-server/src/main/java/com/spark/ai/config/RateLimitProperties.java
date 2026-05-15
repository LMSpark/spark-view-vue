package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "spark.rate-limit")
public class RateLimitProperties {
    private boolean enabled = true;
    private int requestsPerMinute = 600;
    private int burst = 120;
    private boolean trustedProxy = false;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getRequestsPerMinute() { return requestsPerMinute; }
    public void setRequestsPerMinute(int requestsPerMinute) { this.requestsPerMinute = requestsPerMinute; }

    public int getBurst() { return burst; }
    public void setBurst(int burst) { this.burst = burst; }

    public boolean isTrustedProxy() { return trustedProxy; }
    public void setTrustedProxy(boolean trustedProxy) { this.trustedProxy = trustedProxy; }
}
