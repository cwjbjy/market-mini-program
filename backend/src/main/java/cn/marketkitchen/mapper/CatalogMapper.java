package cn.marketkitchen.mapper;

import static cn.marketkitchen.mapper.LegacyDocuments.embeddedIdFilter;
import static cn.marketkitchen.mapper.LegacyDocuments.idFilter;
import static com.mongodb.client.model.Filters.and;
import static com.mongodb.client.model.Filters.elemMatch;
import static com.mongodb.client.model.Filters.or;
import static com.mongodb.client.model.Sorts.ascending;
import static com.mongodb.client.model.Updates.combine;
import static com.mongodb.client.model.Updates.pull;
import static com.mongodb.client.model.Updates.push;
import static com.mongodb.client.model.Updates.set;

import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.entity.Category;
import cn.marketkitchen.entity.Recipe;
import com.mongodb.client.ClientSession;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.FindOneAndUpdateOptions;
import com.mongodb.client.model.ReturnDocument;
import com.mongodb.client.model.UpdateOptions;
import java.util.ArrayList;
import java.util.List;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.stereotype.Component;

@Component
public class CatalogMapper {
    private static final String RECIPES = "foods";

    private final MongoDatabaseFactory factory;

    public CatalogMapper(MongoDatabaseFactory factory) {
        this.factory = factory;
    }

    public List<Category> listCategories() {
        return categories().find().sort(ascending("_id")).map(CatalogMapper::category).into(new ArrayList<>());
    }

    public Category insertCategory(SaveCategory input) {
        Document value = new Document("_id", new ObjectId())
                .append("name", input.name())
                .append("image", input.image())
                .append(RECIPES, List.of());
        categories().insertOne(value);
        return category(value);
    }

    public Category updateCategory(String categoryId, SaveCategory input) {
        Document value = categories().findOneAndUpdate(idFilter("_id", categoryId),
                combine(set("name", input.name()), set("image", input.image())),
                new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER));
        return value == null ? null : category(value);
    }

    public boolean deleteCategory(String categoryId) {
        return categories().deleteOne(idFilter("_id", categoryId)).getDeletedCount() == 1;
    }

    public Recipe findRecipe(String id) {
        StoredRecipe stored = findStoredRecipe(null, id);
        return stored == null ? null : stored.recipe();
    }

    public StoredRecipe findStoredRecipe(ClientSession session, String recipeId) {
        Bson where = elemMatch(RECIPES, embeddedIdFilter(recipeId));
        MongoCollection<Document> categories = categories();
        Document parent = (session == null ? categories.find(where) : categories.find(session, where)).first();
        if (parent == null) {
            return null;
        }
        return LegacyDocuments.children(parent, RECIPES).stream()
                .filter(recipe -> LegacyDocuments.matchesEmbeddedId(recipe, recipeId))
                .findFirst()
                .map(raw -> new StoredRecipe(parent.get("_id"), raw))
                .orElse(null);
    }

    public Recipe insertRecipe(SaveRecipe input) {
        Document value = withRecipeContent(new Document("_id", new ObjectId()).append("num", 0), input);
        Document parent = categories().findOneAndUpdate(idFilter("_id", input.categoryId()), push(RECIPES, value));
        return parent == null ? null : recipe(LegacyDocuments.id(parent), value);
    }

    public Recipe replaceRecipe(ClientSession session, StoredRecipe current, SaveRecipe input) {
        Document updated = withRecipeContent(new Document(current.value()), input);
        Object targetId;
        if (LegacyDocuments.matchesId(current.categoryId(), input.categoryId())) {
            updateRecipeFields(session, current, combine(
                    set("foods.$[recipe].name", input.name()),
                    set("foods.$[recipe].image", input.image()),
                    set("foods.$[recipe].burden", input.ingredients()),
                    set("foods.$[recipe].describe", input.steps())));
            targetId = current.categoryId();
        } else {
            // The surrounding transaction rolls back removal if the destination no longer exists.
            categories().updateOne(session, new Document("_id", current.categoryId()),
                    pull(RECIPES, embeddedIdFilter(current.recipe().id())));
            Document target = categories().findOneAndUpdate(session, idFilter("_id", input.categoryId()),
                    push(RECIPES, updated));
            if (target == null) {
                return null;
            }
            targetId = target.get("_id");
        }
        return recipe(LegacyDocuments.idText(targetId), updated);
    }

    public boolean deleteRecipe(String recipeId) {
        Bson embeddedId = embeddedIdFilter(recipeId);
        return categories().updateOne(elemMatch(RECIPES, embeddedId), pull(RECIPES, embeddedId))
                .getModifiedCount() == 1;
    }

    public void incrementOrderCount(ClientSession session, StoredRecipe current) {
        long nextCount = Math.addExact(current.recipe().orderCount(), 1);
        // Legacy records may contain a missing or null count, which MongoDB cannot increment.
        updateRecipeFields(session, current, set("foods.$[recipe].num", nextCount));
    }

    private void updateRecipeFields(ClientSession session, StoredRecipe current, Bson update) {
        String id = current.recipe().id();
        Bson where = and(new Document("_id", current.categoryId()), elemMatch(RECIPES, embeddedIdFilter(id)));
        var filters = List.of(or(idFilter("recipe._id", id), idFilter("recipe.id", id)));
        categories().updateOne(session, where, update, new UpdateOptions().arrayFilters(filters));
    }

    private MongoCollection<Document> categories() {
        return factory.getMongoDatabase().getCollection("markets");
    }

    private static Document withRecipeContent(Document value, SaveRecipe input) {
        return value.append("name", input.name()).append("image", input.image())
                .append("burden", input.ingredients()).append("describe", input.steps());
    }

    private static Category category(Document value) {
        String id = LegacyDocuments.id(value);
        List<Recipe> recipes = LegacyDocuments.children(value, RECIPES).stream().map(food -> recipe(id, food)).toList();
        return new Category(id, LegacyDocuments.text(value, "name"), LegacyDocuments.text(value, "image"), recipes);
    }

    private static Recipe recipe(String categoryId, Document value) {
        return new Recipe(LegacyDocuments.id(value), categoryId, LegacyDocuments.text(value, "name"),
                LegacyDocuments.text(value, "image"), LegacyDocuments.text(value, "burden"),
                LegacyDocuments.text(value, "describe"), LegacyDocuments.number(value, "num").longValue());
    }

    public record StoredRecipe(Object categoryId, Document value) {
        public Recipe recipe() {
            return CatalogMapper.recipe(LegacyDocuments.idText(categoryId), value);
        }
    }
}
