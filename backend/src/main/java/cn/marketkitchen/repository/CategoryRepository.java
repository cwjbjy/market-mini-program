package cn.marketkitchen.repository;

import cn.marketkitchen.domain.Category;
import cn.marketkitchen.domain.Recipe;
import cn.marketkitchen.mapper.CategoryMapper;
import cn.marketkitchen.mapper.RecipeMapper;
import cn.marketkitchen.mapper.model.CategoryRow;
import cn.marketkitchen.mapper.model.RecipeRow;
import java.util.Collection;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class CategoryRepository {
    private final CategoryMapper categories;
    private final RecipeMapper recipes;

    public CategoryRepository(CategoryMapper categories, RecipeMapper recipes) {
        this.categories = categories;
        this.recipes = recipes;
    }

    public List<Category> listCategories() {
        return categories.listWithRecipes().stream().map(CategoryRow::toCategory).toList();
    }

    public Category findCategory(String id) {
        CategoryRow row = categories.findWithRecipes(id);
        return row == null ? null : row.toCategory();
    }

    public void insertCategory(Category category) {
        categories.insert(new CategoryRow(category.id(), category.name(), category.image()));
    }

    public void updateCategory(Category category) {
        categories.updateById(new CategoryRow(category.id(), category.name(), category.image()));
    }

    public boolean deleteCategory(String id) {
        return categories.deleteById(id) == 1;
    }

    public boolean lockCategory(String id) {
        return categories.lockId(id) != null;
    }

    public Recipe findRecipe(String id) {
        RecipeRow row = recipes.selectById(id);
        return row == null ? null : row.toRecipe();
    }

    public Recipe lockRecipe(String id) {
        RecipeRow row = recipes.lockRecipe(id);
        return row == null ? null : row.toRecipe();
    }

    public List<Recipe> lockRecipes(Collection<String> ids) {
        return recipes.lockRecipes(ids).stream().map(RecipeRow::toRecipe).toList();
    }

    public void insertRecipe(Recipe recipe) {
        // The service holds the destination category lock while assigning the next position.
        recipes.insert(new RecipeRow(recipe.id(), recipe.categoryId(), recipe.name(), recipe.image(),
                recipe.ingredients(), recipe.steps(), recipes.nextPosition(recipe.categoryId())));
    }

    public void updateRecipe(Recipe recipe, String previousCategoryId) {
        boolean moved = !previousCategoryId.equals(recipe.categoryId());
        String categoryId = moved ? recipe.categoryId() : null;
        Long sortOrder = moved ? recipes.nextPosition(categoryId) : null;
        // MyBatis-Plus omits null fields, preserving the count and the position of a recipe edited in place.
        recipes.updateById(new RecipeRow(recipe.id(), categoryId, recipe.name(), recipe.image(), recipe.ingredients(),
                recipe.steps(), sortOrder));
    }

    public boolean deleteRecipe(String id) {
        return recipes.deleteById(id) == 1;
    }

    public void incrementOrderCounts(Collection<String> recipeIds) {
        recipes.incrementOrderCounts(recipeIds);
    }
}
