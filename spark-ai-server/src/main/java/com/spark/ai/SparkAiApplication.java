package com.spark.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.config.PagesConfigProperties;

@SpringBootApplication
@EnableConfigurationProperties({ OpenAiProperties.class, PagesConfigProperties.class })
public class SparkAiApplication {
    public static void main(String[] args) {
        SpringApplication.run(SparkAiApplication.class, args);
    }
}
