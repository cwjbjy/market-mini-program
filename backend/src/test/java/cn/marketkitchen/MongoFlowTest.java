package cn.marketkitchen;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cn.marketkitchen.config.MongoIndexes;
import cn.marketkitchen.config.MongoTransactions;
import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.dto.OrderDtos.SubmitItem;
import cn.marketkitchen.dto.OrderDtos.SubmitOrder;
import cn.marketkitchen.entity.Order;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.mapper.CatalogMapper;
import cn.marketkitchen.mapper.OrderMapper;
import cn.marketkitchen.service.CatalogService;
import cn.marketkitchen.service.OrderService;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.http.HttpStatus;

@EnabledIfEnvironmentVariable(named = "MARKET_TEST_MONGODB_URI", matches = ".+")
class MongoFlowTest {
    private static final String IMAGE = "/static/images/market/sample.png";

    private MongoClient client;
    private SimpleMongoClientDatabaseFactory db;
    private CatalogService catalog;
    private OrderService orders;

    @BeforeEach
    void setUp() {
        client = MongoClients.create(System.getenv("MARKET_TEST_MONGODB_URI"));
        db = new SimpleMongoClientDatabaseFactory(client, "market_test_" + UUID.randomUUID().toString().replace("-", ""));
        var mapper = new CatalogMapper(db);
        var transactions = new MongoTransactions(client);
        catalog = new CatalogService(mapper, transactions);
        orders = new OrderService(mapper, new OrderMapper(db), transactions);
        new MongoIndexes(db).run(null);
    }

    @AfterEach
    void tearDown() {
        if (db != null) {
            db.getMongoDatabase().drop();
        }
        if (client != null) {
            client.close();
        }
    }

    @Test
    void movesAndUpdatesLegacyRecipesWithoutBreakingMixedIdsOrLosingCount() {
        String categoryId = new ObjectId().toHexString();
        var recipeId = new ObjectId();
        db.getMongoDatabase().getCollection("markets").insertOne(new Document("_id", categoryId)
                .append("name", "旧分类").append("image", IMAGE).append("foods", List.of(
                        new Document("id", recipeId).append("name", "旧菜谱").append("image", IMAGE)
                                .append("burden", "旧配料").append("describe", "旧做法").append("num", 3))));
        var target = catalog.createCategory(new SaveCategory("新分类", IMAGE));
        String id = recipeId.toHexString();

        assertThat(catalog.recipe(id).ingredients()).isEqualTo("旧配料");
        var edit = catalog.updateRecipe(id, new SaveRecipe(categoryId, "已编辑", IMAGE, "豆腐", "清蒸"));
        assertThat(edit.name()).isEqualTo("已编辑");
        assertThatThrownBy(() -> catalog.updateRecipe(id, new SaveRecipe("missing", "不能移动", IMAGE, "豆腐", "清蒸")))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThat(catalog.recipe(id)).isEqualTo(edit);

        var moved = catalog.updateRecipe(id, new SaveRecipe(target.id(), "已移动", "/static/images/market/new.jpg",
                "豆腐", "清蒸"));
        assertThat(moved.categoryId()).isEqualTo(target.id());
        assertThat(moved.image()).endsWith("new.jpg");
        assertThat(moved.orderCount()).isEqualTo(3);
        catalog.deleteCategory(categoryId);
        assertThat(catalog.recipe(id)).isEqualTo(moved);
        catalog.deleteRecipe(id);
        assertThatThrownBy(() -> catalog.recipe(id)).isInstanceOf(BusinessException.class);
    }

    @Test
    void checkoutIsAtomicAndItsSnapshotAndIdempotencySurviveDeletion() {
        var category = catalog.createCategory(new SaveCategory("热菜", IMAGE));
        var recipe = catalog.createRecipe(new SaveRecipe(category.id(), "菜谱", IMAGE, "豆腐", "煎熟"));
        var invalid = new SubmitOrder("rollback", List.of(new SubmitItem(recipe.id(), 3), new SubmitItem("missing", 1)));
        assertThatThrownBy(() -> orders.submit(invalid)).isInstanceOf(BusinessException.class);
        assertThat(catalog.recipe(recipe.id()).orderCount()).isZero();
        assertThat(orders.recentOrders()).isEmpty();

        var request = new SubmitOrder("one-key", List.of(new SubmitItem(recipe.id(), 3)));
        Order order = orders.submit(request);
        assertThat(orders.submit(request)).isEqualTo(order);
        assertThat(catalog.recipe(recipe.id()).orderCount()).isOne();
        assertThatThrownBy(() -> orders.submit(new SubmitOrder("one-key", List.of(new SubmitItem(recipe.id(), 2)))))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));

        catalog.deleteCategory(category.id());
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
        var category = catalog.createCategory(new SaveCategory("热菜", IMAGE));
        var recipe = catalog.createRecipe(new SaveRecipe(category.id(), "菜谱", IMAGE, "豆腐", "煎熟"));
        var request = new SubmitOrder("concurrent", List.of(new SubmitItem(recipe.id(), 2)));

        var executor = Executors.newFixedThreadPool(4);
        try {
            List<Callable<Order>> actions = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                actions.add(() -> orders.submit(request));
            }
            var submitted = executor.invokeAll(actions, 20, TimeUnit.SECONDS);
            Order first = submitted.get(0).get();
            for (var pending : submitted) {
                assertThat(pending.get()).isEqualTo(first);
            }
            assertThat(orders.recentOrders()).containsExactly(first);
            assertThat(catalog.recipe(recipe.id()).orderCount()).isOne();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void onlyReturnsTheFiftyMostRecentHistoricalBsonDates() {
        var stored = db.getMongoDatabase().getCollection("orders");
        Instant start = Instant.parse("2026-01-01T00:00:00Z");
        List<Document> input = new ArrayList<>();
        for (int i = 0; i < 53; i++) {
            input.add(new Document("_id", "legacy-" + i).append("createdAt", Date.from(start.plusSeconds(i)))
                    .append("foods", List.of(new Document("id", "old").append("name", "旧菜品").append("value", 2))));
        }
        stored.insertMany(input);
        List<Order> page = orders.recentOrders();
        assertThat(page).hasSize(50);
        assertThat(page.get(0).id()).isEqualTo("legacy-52");
        assertThat(page.get(49).id()).isEqualTo("legacy-3");
        assertThat(page.get(0).items().get(0).recipeId()).isEqualTo("old");
    }
}
