package com.spark.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.spark.ai.config.AiSessionProperties;
import com.spark.ai.config.DynamicDataSourceProperties;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.config.RateLimitProperties;
import com.spark.ai.config.WorkflowDesignProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({
    OpenAiProperties.class,
    PagesConfigProperties.class,
    WorkflowDesignProperties.class,
    DynamicDataSourceProperties.class,
    AiSessionProperties.class,
    RateLimitProperties.class
})
public class SparkAiApplication extends SpringBootServletInitializer {
    public static void main(String[] args) {
        SpringApplication.run(SparkAiApplication.class, args);
    }

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(SparkAiApplication.class);
    }
}
