package cn.marketkitchen.mapper.model;

import cn.marketkitchen.domain.Recipe;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("recipes")
public class RecipeRow {
    @TableId(type = IdType.INPUT)
    private String id;
    private String categoryId;
    private String name;
    private String image;
    private String ingredients;
    private String steps;
    private Long orderCount;
    private Long sortOrder;

    public RecipeRow() {}

    public RecipeRow(String id, String categoryId, String name, String image, String ingredients, String steps,
            Long sortOrder) {
        this.id = id;
        this.categoryId = categoryId;
        this.name = name;
        this.image = image;
        this.ingredients = ingredients;
        this.steps = steps;
        this.sortOrder = sortOrder;
    }

    public Recipe toRecipe() {
        return new Recipe(id, categoryId, name, image, ingredients, steps, orderCount);
    }
}
