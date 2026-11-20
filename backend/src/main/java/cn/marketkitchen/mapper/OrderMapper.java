package cn.marketkitchen.mapper;

import static cn.marketkitchen.mapper.LegacyDocuments.idFilter;
import static com.mongodb.client.model.Filters.eq;
import static com.mongodb.client.model.Sorts.descending;

import cn.marketkitchen.entity.Order;
import com.mongodb.client.ClientSession;
import com.mongodb.client.MongoCollection;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.stereotype.Component;

@Component
public class OrderMapper {
    public static final ZoneId DISPLAY_ZONE = ZoneId.of("Asia/Shanghai");
    public static final DateTimeFormatter DISPLAY_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.ROOT);
    private static final DateTimeFormatter JS_DATE = DateTimeFormatter.ofPattern("EEE MMM dd yyyy HH:mm:ss 'GMT'xx", Locale.ENGLISH);
    private static final int LIST_LIMIT = 50;

    private final MongoDatabaseFactory factory;

    public OrderMapper(MongoDatabaseFactory factory) {
        this.factory = factory;
    }

    public List<Order> recentOrders() {
        // Migration converts all historical timestamps to BSON dates before cutover.
        return orders().find(eq("deletedAt", null)).sort(descending("createdAt", "_id")).limit(LIST_LIMIT)
                .map(OrderMapper::order).into(new ArrayList<>());
    }

    public StoredOrder findByRequestId(ClientSession session, String requestId) {
        var where = eq("_id", idForRequest(requestId));
        MongoCollection<Document> orders = orders();
        Document current = (session == null ? orders.find(where) : orders.find(session, where)).first();
        if (current == null) {
            return null;
        }
        Map<String, Integer> requested = new HashMap<>();
        for (Document item : LegacyDocuments.children(current, "requestItems")) {
            requested.put(item.getString("recipeId"), item.getInteger("quantity"));
        }
        return new StoredOrder(order(current), requested);
    }

    public boolean hideOrder(String id, Instant now) {
        var deletionTime = new Document("$ifNull", List.of("$deletedAt", Date.from(now)));
        return orders().updateOne(idFilter("_id", id), List.of(new Document("$set", new Document("deletedAt", deletionTime))))
                .getMatchedCount() == 1;
    }

    public void insert(ClientSession session, Order order, Map<String, Integer> requestedItems) {
        List<Document> items = order.items().stream().map(item -> new Document("_id", item.recipeId())
                .append("name", item.name())
                .append("image", item.image())
                .append("describe", item.steps())
                .append("burden", item.ingredients())
                .append("value", item.quantity())).toList();
        List<Document> request = requestedItems.entrySet().stream()
                .map(item -> new Document("recipeId", item.getKey()).append("quantity", item.getValue())).toList();
        orders().insertOne(session, new Document("_id", order.id())
                .append("date", order.date())
                .append("createdAt", Date.from(order.createdAt()))
                .append("num", items.size())
                .append("foods", items)
                .append("requestItems", request));
    }

    private MongoCollection<Document> orders() {
        return factory.getMongoDatabase().getCollection("orders");
    }

    public static String idForRequest(String requestId) {
        // A namespace distinct from historical ObjectIds, backed by MongoDB's unique _id index.
        return "order:" + requestId;
    }

    private static Order order(Document raw) {
        var items = LegacyDocuments.children(raw, "foods").stream().map(item -> new Order.Item(
                LegacyDocuments.id(item), LegacyDocuments.text(item, "name"), LegacyDocuments.text(item, "image"),
                LegacyDocuments.text(item, "burden"), LegacyDocuments.text(item, "describe"),
                LegacyDocuments.number(item, "value").intValue())).toList();
        String date = LegacyDocuments.text(raw, "date");
        Instant createdAt = createdAt(raw.get("createdAt"), date);
        if (date.isBlank() && createdAt != null) {
            date = DISPLAY_TIME.format(createdAt.atZone(DISPLAY_ZONE));
        }
        return new Order(LegacyDocuments.id(raw), date, createdAt, items);
    }

    private static Instant createdAt(Object value, String fallback) {
        if (value instanceof Date date) {
            return date.toInstant();
        }
        if (value instanceof String text) {
            try {
                return Instant.parse(text);
            } catch (DateTimeParseException ignored) {
                // Mongoose also used JavaScript Date's string representation.
            }
            try {
                return OffsetDateTime.parse(text.replaceFirst(" \\(.*\\)$", ""), JS_DATE).toInstant();
            } catch (DateTimeParseException ignored) {
                // Historical display date is parsed below.
            }
        }
        try {
            return LocalDateTime.parse(fallback, DISPLAY_TIME).atZone(DISPLAY_ZONE).toInstant();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    public record StoredOrder(Order order, Map<String, Integer> requestedItems) {}
}
