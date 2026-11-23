package cn.marketkitchen.service;

import cn.marketkitchen.domain.Category;
import cn.marketkitchen.domain.Recipe;
import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.image.ImageReference;
import cn.marketkitchen.repository.CategoryRepository;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Manages categories and the recipes they contain. */
@Service
public class CategoryService {
    private final CategoryRepository categoryRepository;
    private final TransactionTemplate transactions;

    public CategoryService(CategoryRepository categoryRepository, TransactionTemplate transactions) {
        this.categoryRepository = categoryRepository;
        this.transactions = transactions;
    }

    public List<Category> categories() {
        return categoryRepository.listCategories();
    }

    public Category createCategory(SaveCategory input) {
        Category category = categoryFromInput(UUID.randomUUID().toString(), input);
        return writeCategory(() -> {
            categoryRepository.insertCategory(category);
            return category;
        });
    }

    public Category updateCategory(String id, SaveCategory input) {
        Category updated = categoryFromInput(id, input);
        return writeCategory(() -> transactions.execute(status -> {
            if (!categoryRepository.lockCategory(id)) {
                throw BusinessException.notFound("分类不存在");
            }
            categoryRepository.updateCategory(updated);
            return categoryRepository.findCategory(id);
        }));
    }

    public void deleteCategory(String id) {
        if (!categoryRepository.deleteCategory(id)) {
            throw BusinessException.notFound("分类不存在");
        }
    }

    public Recipe recipe(String id) {
        return require(categoryRepository.findRecipe(id), "菜谱不存在");
    }

    public Recipe createRecipe(SaveRecipe input) {
        Recipe recipe = recipeFromInput(UUID.randomUUID().toString(), input);
        return transactions.execute(status -> {
            if (!categoryRepository.lockCategory(recipe.categoryId())) {
                throw BusinessException.notFound("分类不存在");
            }
            categoryRepository.insertRecipe(recipe);
            return recipe;
        });
    }

    public Recipe updateRecipe(String id, SaveRecipe input) {
        Recipe updated = recipeFromInput(id, input);
        return transactions.execute(status -> {
            boolean targetExists = categoryRepository.lockCategory(updated.categoryId());
            var current = require(categoryRepository.lockRecipe(id), "菜谱不存在");
            if (!targetExists) {
                throw BusinessException.notFound("目标分类不存在");
            }
            Recipe recipe = updated.withOrderCount(current.orderCount());
            categoryRepository.updateRecipe(recipe, current.categoryId());
            return recipe;
        });
    }

    public void deleteRecipe(String id) {
        if (!categoryRepository.deleteRecipe(id)) {
            throw BusinessException.notFound("菜谱不存在");
        }
    }

    private static Category categoryFromInput(String id, SaveCategory input) {
        return new Category(id, input.name().strip(), ImageReference.validate(input.image()), List.of());
    }

    private static Recipe recipeFromInput(String id, SaveRecipe input) {
        return new Recipe(id, input.categoryId(), input.name().strip(), ImageReference.validate(input.image()),
                input.ingredients().strip(), input.steps().strip(), 0);
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
        } catch (DuplicateKeyException error) {
            throw BusinessException.conflict("已存在相同名称的分类");
        }
    }
}
