# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY backend/pom.xml ./pom.xml
COPY backend/src/main ./src/main
RUN mvn -B -ntp -Dmaven.test.skip=true package

FROM mongo:8.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --no-create-home --user-group market \
    && install -d -o market -g market /data/uploads

WORKDIR /opt/market
COPY --from=build /build/target/market-kitchen-*.jar ./app.jar
COPY --chmod=755 docker/market-entrypoint.sh /usr/local/bin/market-entrypoint

ENV MARKET_UPLOAD_DIR=/data/uploads
VOLUME ["/data/db", "/data/uploads"]
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s \
    CMD bash -c 'exec 3<>"/dev/tcp/127.0.0.1/${MARKET_SERVER_PORT:-8080}"'
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/market-entrypoint"]
CMD ["java", "-jar", "/opt/market/app.jar"]
