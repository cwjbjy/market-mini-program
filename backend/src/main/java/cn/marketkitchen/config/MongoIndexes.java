package cn.marketkitchen.config;

import static com.mongodb.client.model.Indexes.ascending;
import static com.mongodb.client.model.Indexes.compoundIndex;
import static com.mongodb.client.model.Indexes.descending;

import com.mongodb.client.model.IndexOptions;
import org.bson.Document;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.stereotype.Component;

@Component
public class MongoIndexes implements ApplicationRunner {
    private final MongoDatabaseFactory factory;

    public MongoIndexes(MongoDatabaseFactory factory) {
        this.factory = factory;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        var db = factory.getMongoDatabase();
        var categories = db.getCollection("markets");
        boolean categoryNameIndexExists = false;
        for (Document index : categories.listIndexes()) {
            categoryNameIndexExists |= Boolean.TRUE.equals(index.getBoolean("unique"))
                    && new Document("name", 1).equals(index.get("key"))
                    && !Boolean.TRUE.equals(index.getBoolean("sparse"))
                    && !index.containsKey("partialFilterExpression");
        }
        if (!categoryNameIndexExists) {
            categories.createIndex(ascending("name"), new IndexOptions().unique(true).name("market_category_name"));
        }
        db.getCollection("orders").createIndex(compoundIndex(ascending("deletedAt"), descending("createdAt", "_id")));
    }
}
