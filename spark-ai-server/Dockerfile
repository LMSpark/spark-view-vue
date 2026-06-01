FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
ENV SPRING_PROFILES_ACTIVE=prod
COPY --from=build /workspace/target/spark-ai-server-1.0.0.jar /app/spark-ai-server.jar
EXPOSE 8180
ENTRYPOINT ["java", "-jar", "/app/spark-ai-server.jar"]
