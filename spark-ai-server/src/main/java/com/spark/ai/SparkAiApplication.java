package com.spark.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.spark.ai.config.AiSessionProperties;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.config.RateLimitProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({
    OpenAiProperties.class,
    PagesConfigProperties.class,
    AiSessionProperties.class,
    RateLimitProperties.class
})
public class SparkAiApplication {
    public static void main(String[] args) {
        SpringApplication.run(SparkAiApplication.class, args);
    }
}
