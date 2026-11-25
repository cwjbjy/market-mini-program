package cn.marketkitchen;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.dto.CatalogDtos.SortOrder;
import cn.marketkitchen.dto.OrderDtos.SubmitItem;
import cn.marketkitchen.dto.OrderDtos.SubmitOrder;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.service.CategoryService;
import cn.marketkitchen.service.OrderService;
import cn.marketkitchen.vo.CategoryVO;
import cn.marketkitchen.vo.OrderVO;
import cn.marketkitchen.vo.RecipeVO;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfEnvironmentVariable(named = "MARKET_TEST_MYSQL_URL", matches = ".+")
class MySqlFlowTest {
    private static final String IMAGE = "/static/images/market/sample.png";

    private String database;
    private ConfigurableApplicationContext application;
    private JdbcTemplate admin;
    private JdbcTemplate db;
    private CategoryService categoryService;
    private OrderService orders;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(System.getenv("MARKET_TEST_MYSQL_URL"),
                System.getenv("MARKET_TEST_MYSQL_USER"), System.getenv("MARKET_TEST_MYSQL_PASSWORD"));
        admin = new JdbcTemplate(dataSource);
        database = "market_test_" + UUID.randomUUID().toString().replace("-", "");
        admin.execute("CREATE DATABASE " + database);
        dataSource.setCatalog(database);
        db = new JdbcTemplate(dataSource);
        application = new SpringApplicationBuilder(MarketKitchenApplication.class)
                .web(WebApplicationType.NONE)
                .initializers(context -> ((GenericApplicationContext) context).registerBean(DataSource.class, () -> dataSource))
                .run("--spring.main.banner-mode=off", "--mybatis-plus.global-config.banner=false");
        categoryService = application.getBean(CategoryService.class);
        orders = application.getBean(OrderService.class);
    }

    @AfterEach
    void tearDown() {
        try {
            if (application != null) {
                application.close();
            }
        } finally {
            if (database != null) {
                admin.execute("DROP DATABASE IF EXISTS " + database);
            }
        }
    }

    @Test
    void movesAndUpdatesMigratedRecipesWithoutChangingTheirIdsOrLosingCount() {
        String categoryId = "0123456789abcdef01234567";
        String id = "fedcba9876543210fedcba98";
        db.update("INSERT INTO categories (id, name, image) VALUES (?, ?, ?)", categoryId, "旧分类", IMAGE);
        db.update("""
                INSERT INTO recipes (id, category_id, name, image, ingredients, steps, order_count, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, categoryId, "旧菜谱", IMAGE, "旧配料", "旧做法", 3, 1);
        var target = categoryService.createCategory(new SaveCategory("新分类", IMAGE));
        var existing = categoryService.createRecipe(new SaveRecipe(target.id(), "已有菜谱", IMAGE, "豆腐", "清蒸"));

        assertThat(categoryService.recipe(id).ingredients()).isEqualTo("旧配料");
        var edit = categoryService.updateRecipe(id, new SaveRecipe(categoryId, "已编辑", IMAGE, "豆腐", "清蒸"));
        assertThat(edit.name()).isEqualTo("已编辑");
        assertThatThrownBy(() -> categoryService.updateRecipe(id, new SaveRecipe("missing", "不能移动", IMAGE, "豆腐", "清蒸")))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThat(categoryService.recipe(id)).isEqualTo(edit);

        var moved = categoryService.updateRecipe(id, new SaveRecipe(target.id(), "已移动", "/static/images/market/new.jpg",
                "豆腐", "清蒸"));
        assertThat(moved.categoryId()).isEqualTo(target.id());
        assertThat(moved.image()).endsWith("new.jpg");
        assertThat(moved.orderCount()).isEqualTo(3);
        assertThat(categoryService.categories()).extracting(category -> category.id()).containsExactly(categoryId, target.id());
        assertThat(categoryService.categories().get(1).recipes()).containsExactly(existing, moved);
        categoryService.deleteCategory(categoryId);
        assertThat(categoryService.recipe(id)).isEqualTo(moved);
        categoryService.deleteRecipe(id);
        assertThatThrownBy(() -> categoryService.recipe(id)).isInstanceOf(BusinessException.class);
    }

    @Test
    void reordersExistingCategoriesAndStillAppendsNewOnes() {
        var first = categoryService.createCategory(new SaveCategory("热菜", IMAGE));
        var second = categoryService.createCategory(new SaveCategory("凉菜", IMAGE));
        var third = categoryService.createCategory(new SaveCategory("甜点", IMAGE));
        var original = List.of(first.id(), second.id(), third.id());
        var reordered = List.of(third.id(), first.id(), second.id());

        var order = new SortOrder(reordered, original);
        categoryService.reorderCategories(order);
        categoryService.reorderCategories(order);
        assertThat(categoryService.categories()).containsExactly(third, first, second);
        assertThatThrownBy(() -> categoryService.reorderCategories(new SortOrder(original, original)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));

        var added = categoryService.createCategory(new SaveCategory("主食", IMAGE));
        assertThat(categoryService.categories()).extracting(CategoryVO::id)
                .containsExactly(third.id(), first.id(), second.id(), added.id());
    }

    @Test
    void reordersRecipesOnlyWithinTheSelectedCategory() {
        var firstCategory = categoryService.createCategory(new SaveCategory("热菜", IMAGE));
        var secondCategory = categoryService.createCategory(new SaveCategory("凉菜", IMAGE));
        var first = categoryService.createRecipe(new SaveRecipe(firstCategory.id(), "豆腐", IMAGE, "豆腐", "煎"));
        var second = categoryService.createRecipe(new SaveRecipe(firstCategory.id(), "青菜", IMAGE, "青菜", "炒"));
        var other = categoryService.createRecipe(new SaveRecipe(secondCategory.id(), "黄瓜", IMAGE, "黄瓜", "凉拌"));
        var original = List.of(first.id(), second.id());

        assertThatThrownBy(() -> categoryService.reorderRecipes(firstCategory.id(), new SortOrder(
                List.of(other.id(), first.id()), List.of(first.id(), other.id()))))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));
        assertThatThrownBy(() -> categoryService.reorderRecipes(firstCategory.id(), new SortOrder(
                List.of(second.id(), second.id()), original)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThat(categoryService.categories().get(0).recipes()).containsExactly(first, second);

        categoryService.reorderRecipes(firstCategory.id(), new SortOrder(List.of(second.id(), first.id()), original));
        var added = categoryService.createRecipe(new SaveRecipe(firstCategory.id(), "蘑菇", IMAGE, "蘑菇", "炒"));
        var menu = categoryService.categories();
        assertThat(menu.get(0).recipes()).extracting(RecipeVO::id).containsExactly(second.id(), first.id(), added.id());
        assertThat(menu.get(1).recipes()).containsExactly(other);
    }

    @Test
    void checkoutIsAtomicAndItsSnapshotAndIdempotencySurviveDeletion() {
        var category = categoryService.createCategory(new SaveCategory("热菜", IMAGE));
        var recipe = categoryService.createRecipe(new SaveRecipe(category.id(), "菜谱", IMAGE, "豆腐", "煎熟"));
        var invalid = new SubmitOrder("rollback", List.of(new SubmitItem(recipe.id(), 3), new SubmitItem("missing", 1)));
        assertThatThrownBy(() -> orders.submit(invalid)).isInstanceOf(BusinessException.class);
        assertThat(categoryService.recipe(recipe.id()).orderCount()).isZero();
        assertThat(orders.recentOrders()).isEmpty();

        var request = new SubmitOrder("one-key", List.of(new SubmitItem(recipe.id(), 3)));
        OrderVO order = orders.submit(request);
        assertThat(orders.submit(request)).isEqualTo(order);
        assertThat(categoryService.recipe(recipe.id()).orderCount()).isOne();
        assertThatThrownBy(() -> orders.submit(new SubmitOrder("one-key", List.of(new SubmitItem(recipe.id(), 2)))))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));

        categoryService.deleteCategory(category.id());
        assertThat(orders.recentOrders()).containsExactly(order);
        assertThat(order.items().get(0).image()).isEqualTo(IMAGE);
        assertThat(order.items().get(0).quantity()).isEqualTo(3);
        orders.delete(order.id());
        orders.delete(order.id());
        assertThat(orders.recentOrders()).isEmpty();
        assertThat(orders.submit(request)).isEqualTo(order);
        assertThat(orders.recentOrders()).isEmpty();
    }

    @Test
    void concurrentDuplicateSubmissionsCountAsOneOrder() throws Exception {
        var category = categoryService.createCategory(new SaveCategory("热菜", IMAGE));
        var recipe = categoryService.createRecipe(new SaveRecipe(category.id(), "菜谱", IMAGE, "豆腐", "煎熟"));
        var request = new SubmitOrder("concurrent", List.of(new SubmitItem(recipe.id(), 2)));

        var executor = Executors.newFixedThreadPool(4);
        try {
            List<Callable<OrderVO>> actions = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                actions.add(() -> orders.submit(request));
            }
            var submitted = executor.invokeAll(actions, 20, TimeUnit.SECONDS);
            OrderVO first = submitted.get(0).get();
            for (var pending : submitted) {
                assertThat(pending.get()).isEqualTo(first);
            }
            assertThat(orders.recentOrders()).containsExactly(first);
            assertThat(categoryService.recipe(recipe.id()).orderCount()).isOne();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentOrdersLockSharedRecipesAndKeepEachOrdersItemSequence() throws Exception {
        var category = categoryService.createCategory(new SaveCategory("热菜", IMAGE));
        var first = categoryService.createRecipe(new SaveRecipe(category.id(), "第一道", IMAGE, "豆腐", "煎熟"));
        var second = categoryService.createRecipe(new SaveRecipe(category.id(), "第二道", IMAGE, "青菜", "炒熟"));
        var firstItem = new SubmitItem(first.id(), 1);
        var secondItem = new SubmitItem(second.id(), 2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var submitted = executor.invokeAll(List.<Callable<OrderVO>>of(
                    () -> orders.submit(new SubmitOrder("first-order", List.of(firstItem, secondItem))),
                    () -> orders.submit(new SubmitOrder("second-order", List.of(secondItem, firstItem)))),
                    20, TimeUnit.SECONDS);
            assertThat(submitted.get(0).get().items()).extracting(OrderVO.Item::recipeId)
                    .containsExactly(first.id(), second.id());
            assertThat(submitted.get(1).get().items()).extracting(OrderVO.Item::recipeId)
                    .containsExactly(second.id(), first.id());
            assertThat(orders.recentOrders()).containsExactlyInAnyOrder(submitted.get(0).get(), submitted.get(1).get());
            assertThat(categoryService.recipe(first.id()).orderCount()).isEqualTo(2);
            assertThat(categoryService.recipe(second.id()).orderCount()).isEqualTo(2);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void onlyReturnsTheFiftyMostRecentHistoricalOrders() {
        Instant start = Instant.parse("2026-01-01T00:00:00Z");
        for (int i = 0; i < 53; i++) {
            String id = "legacy-" + i;
            db.update("INSERT INTO orders (id, display_date, created_at) VALUES (?, ?, ?)",
                    id, "", LocalDateTime.ofInstant(start.plusSeconds(i), ZoneOffset.UTC));
            db.update("""
                    INSERT INTO order_items (order_id, line_number, recipe_id, name, image, ingredients, steps, quantity)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, 0, "old", "旧菜品", IMAGE, "", "", 2);
        }
        List<OrderVO> page = orders.recentOrders();
        assertThat(page).hasSize(50);
        assertThat(page.get(0).id()).isEqualTo("legacy-52");
        assertThat(page.get(49).id()).isEqualTo("legacy-3");
        assertThat(page.get(0).items().get(0).recipeId()).isEqualTo("old");
        assertThat(page.get(0).date()).isEqualTo("2026-01-01 08:00:52");
    }
}
