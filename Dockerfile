# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY backend/pom.xml ./pom.xml
COPY backend/src/main ./src/main
RUN --mount=type=cache,target=/root/.m2/repository mvn -B -ntp -Dmaven.test.skip=true package

FROM mysql:8.0
COPY --from=build /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="$JAVA_HOME/bin:$PATH"
RUN useradd --system --no-create-home --user-group market \
    && install -d -o market -g market /data/uploads

WORKDIR /opt/market
COPY --from=build /build/target/market-kitchen-*.jar ./app.jar
COPY --chmod=755 docker/market-entrypoint.sh /usr/local/bin/market-entrypoint

ENV MYSQL_DATABASE=market_app MARKET_UPLOAD_DIR=/data/uploads
VOLUME ["/var/lib/mysql", "/data/uploads"]
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s \
    CMD bash -c 'exec 3<>"/dev/tcp/127.0.0.1/${MARKET_SERVER_PORT:-8080}"'
ENTRYPOINT ["/usr/local/bin/market-entrypoint"]
CMD ["java", "-jar", "/opt/market/app.jar"]
