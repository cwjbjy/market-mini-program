package cn.marketkitchen;

import static org.assertj.core.api.Assertions.assertThat;

import cn.marketkitchen.domain.Category;
import cn.marketkitchen.domain.Recipe;
import cn.marketkitchen.service.CategoryService;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

@EnabledIfEnvironmentVariable(named = "MARKET_TEST_MYSQL_URL", matches = ".+")
class FlywayMigrationTest {
    @Test
    void adoptsAnExistingDatabaseAndKeepsItsDataAcrossRestarts() {
        var dataSource = new DriverManagerDataSource(System.getenv("MARKET_TEST_MYSQL_URL"),
                System.getenv("MARKET_TEST_MYSQL_USER"), System.getenv("MARKET_TEST_MYSQL_PASSWORD"));
        var admin = new JdbcTemplate(dataSource);
        String database = "market_test_" + UUID.randomUUID().toString().replace("-", "");
        admin.execute("CREATE DATABASE " + database);
        try {
            dataSource.setCatalog(database);
            var db = new JdbcTemplate(dataSource);
            new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__initial_schema.sql"))
                    .execute(dataSource);

            String image = "/static/images/market/sample.png";
            db.update("INSERT INTO categories (id, name, image) VALUES (?, ?, ?)", "legacy", "旧分类", image);
            db.update("""
                    INSERT INTO recipes (id, category_id, name, image, ingredients, steps, order_count, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, 3, 1)
                    """, "legacy-recipe", "legacy", "旧菜谱", image, "豆腐", "清蒸");

            String versionQuery = "SELECT version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank";
            var recipe = new Recipe("legacy-recipe", "legacy", "旧菜谱", image, "豆腐", "清蒸", 3);
            var category = new Category("legacy", "旧分类", image, List.of(recipe));
            try (var application = startApplication(dataSource)) {
                assertThat(application.getBean(CategoryService.class).categories()).containsExactly(category);
            }
            var versions = db.queryForList(versionQuery, String.class);
            assertThat(versions).startsWith("0", "1");

            try (var application = startApplication(dataSource)) {
                assertThat(application.getBean(CategoryService.class).recipe("legacy-recipe").orderCount()).isEqualTo(3);
            }
            assertThat(db.queryForList(versionQuery, String.class)).isEqualTo(versions);
        } finally {
            dataSource.setCatalog(null);
            admin.execute("DROP DATABASE IF EXISTS " + database);
        }
    }

    private ConfigurableApplicationContext startApplication(DataSource dataSource) {
        return new SpringApplicationBuilder(MarketKitchenApplication.class)
                .web(WebApplicationType.NONE)
                .initializers(context -> ((GenericApplicationContext) context).registerBean(DataSource.class, () -> dataSource))
                .run("--spring.main.banner-mode=off", "--mybatis-plus.global-config.banner=false");
    }
}
