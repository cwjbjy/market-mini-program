package cn.marketkitchen.service;

import cn.marketkitchen.config.MongoTransactions;
import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.entity.Category;
import cn.marketkitchen.entity.Recipe;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.mapper.CatalogMapper;
import com.mongodb.MongoException;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {
    private final CatalogMapper catalog;
    private final MongoTransactions transactions;

    public CatalogService(CatalogMapper catalog, MongoTransactions transactions) {
        this.catalog = catalog;
        this.transactions = transactions;
    }

    public List<Category> categories() {
        return catalog.listCategories();
    }

    public Category createCategory(SaveCategory input) {
        return writeCategory(() -> catalog.insertCategory(cleanCategory(input)));
    }

    public Category updateCategory(String id, SaveCategory input) {
        return require(writeCategory(() -> catalog.updateCategory(id, cleanCategory(input))), "分类不存在");
    }

    public void deleteCategory(String id) {
        if (!catalog.deleteCategory(id)) {
            throw BusinessException.notFound("分类不存在");
        }
    }

    public Recipe recipe(String id) {
        return require(catalog.findRecipe(id), "菜谱不存在");
    }

    public Recipe createRecipe(SaveRecipe input) {
        return require(catalog.insertRecipe(cleanRecipe(input)), "分类不存在");
    }

    public Recipe updateRecipe(String id, SaveRecipe input) {
        SaveRecipe updated = cleanRecipe(input);
        return transactions.run(session -> {
            var current = require(catalog.findStoredRecipe(session, id), "菜谱不存在");
            return require(catalog.replaceRecipe(session, current, updated), "目标分类不存在");
        });
    }

    public void deleteRecipe(String id) {
        if (!catalog.deleteRecipe(id)) {
            throw BusinessException.notFound("菜谱不存在");
        }
    }

    private static SaveCategory cleanCategory(SaveCategory input) {
        return new SaveCategory(input.name().strip(), ImageStorage.validateReference(input.image()));
    }

    private static SaveRecipe cleanRecipe(SaveRecipe input) {
        return new SaveRecipe(input.categoryId(), input.name().strip(), ImageStorage.validateReference(input.image()),
                input.ingredients().strip(), input.steps().strip());
    }

    private static <T> T require(T value, String message) {
        if (value == null) {
            throw BusinessException.notFound(message);
        }
        return value;
    }

    private static Category writeCategory(Supplier<Category> operation) {
        try {
            return operation.get();
        } catch (MongoException error) {
            if (error.getCode() == 11000) {
                throw BusinessException.conflict("已存在相同名称的分类");
            }
            throw error;
        }
    }
}
