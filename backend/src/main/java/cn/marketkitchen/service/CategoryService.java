package cn.marketkitchen.service;

import cn.marketkitchen.domain.Category;
import cn.marketkitchen.domain.Recipe;
import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.dto.CatalogDtos.SortOrder;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.image.ImageReference;
import cn.marketkitchen.mapper.model.CategoryPosition;
import cn.marketkitchen.repository.CategoryRepository;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Manages categories and the recipes they contain. */
@Service
@RequiredArgsConstructor
public class CategoryService {
    private final CategoryRepository categoryRepository;
    private final TransactionTemplate transactions;

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

    public void reorderCategories(SortOrder order) {
        transactions.executeWithoutResult(status -> {
            var positions = categoryRepository.lockCategoryPositions();
            var current = positions.stream().map(CategoryPosition::id).toList();
            if (needsReorder(order, current)) categoryRepository.updateCategoryOrder(positions, order.ids());
        });
    }

    public void reorderRecipes(String categoryId, SortOrder order) {
        transactions.executeWithoutResult(status -> {
            if (!categoryRepository.lockCategory(categoryId)) {
                throw BusinessException.notFound("分类不存在");
            }
            var current = categoryRepository.lockRecipeOrder(categoryId);
            if (needsReorder(order, current)) categoryRepository.updateRecipeOrder(categoryId, order.ids());
        });
    }

    private static boolean needsReorder(SortOrder order, List<String> current) {
        var requestedIds = new HashSet<>(order.ids());
        if (requestedIds.size() != order.ids().size() || requestedIds.size() != order.expectedIds().size()
                || !requestedIds.equals(new HashSet<>(order.expectedIds()))) {
            throw BusinessException.badRequest("排序前后的项目必须一致，且不能重复");
        }
        // Retrying a save that already took effect should succeed even if its original order is stale.
        if (current.equals(order.ids())) return false;
        if (!current.equals(order.expectedIds())) {
            throw BusinessException.conflict("菜单顺序或内容已变化，请重新加载后再调整");
        }
        return true;
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
