package cn.marketkitchen;

import static org.assertj.core.api.Assertions.assertThat;

import cn.marketkitchen.service.CategoryService;
import cn.marketkitchen.service.OrderService;
import cn.marketkitchen.vo.CookingInstructions;
import cn.marketkitchen.vo.RecipeVO;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    void adoptsAnExistingDatabaseAndKeepsItsDataAcrossRestarts() throws Exception {
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
            String curatedId = "6a2e92e1b60e9c065cf18912";
            try (var source = new ClassPathResource("db/recipe-instructions-v3.json").getInputStream()) {
                String original = new ObjectMapper().readTree(source).get(curatedId).get("original").asText();
                db.update("""
                        INSERT INTO recipes (id, category_id, name, image, ingredients, steps, order_count, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, 0, 2)
                        """, curatedId, "legacy", "番茄蛋汤", image, "番茄、鸡蛋", original);
            }
            db.update("INSERT INTO orders (id, display_date) VALUES ('legacy-order', '旧订单')");
            db.update("""
                    INSERT INTO order_items (order_id, line_number, recipe_id, name, image, ingredients, steps, quantity)
                    VALUES ('legacy-order', 0, ?, '番茄蛋汤', ?, '番茄、鸡蛋', ?, 1)
                    """, curatedId, image, "1、旧做法一\n2、旧做法二");

            String versionQuery = "SELECT version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank";
            var recipe = new RecipeVO("legacy-recipe", "legacy", "旧菜谱", image, "豆腐", instructions("清蒸"), 3);
            try (var application = startApplication(dataSource)) {
                var catalog = application.getBean(CategoryService.class);
                assertThat(catalog.recipe(recipe.id())).isEqualTo(recipe);
                assertThat(catalog.recipe(curatedId).instructions().steps()).hasSize(4);
                var snapshot = application.getBean(OrderService.class).detail("legacy-order").items().get(0);
                assertThat(snapshot.instructions().steps()).extracting(CookingInstructions.Step::text)
                        .containsExactly("旧做法一", "旧做法二");
            }
            var versions = db.queryForList(versionQuery, String.class);
            assertThat(versions).containsExactly("0", "1", "2", "3", "4");

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
    private static CookingInstructions instructions(String text) {
        return new CookingInstructions(List.of(new CookingInstructions.Step("step-1", text)), List.of());
    }

}
