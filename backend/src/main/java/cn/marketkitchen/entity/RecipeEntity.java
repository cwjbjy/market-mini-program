package cn.marketkitchen.entity;

import cn.marketkitchen.vo.RecipeVO;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("recipes")
public class RecipeEntity {
    @TableId(type = IdType.INPUT)
    private String id;
    private String categoryId;
    private String name;
    private String image;
    private String ingredients;
    private String steps;
    private Long orderCount;
    // Written by insert/update and read back by MyBatis mapping; no Java code consumes the value.
    @SuppressWarnings("unused")
    private Long sortOrder;

    public RecipeEntity() {}

    public RecipeEntity(String id, String categoryId, String name, String image, String ingredients, String steps,
            Long sortOrder) {
        this.id = id;
        this.categoryId = categoryId;
        this.name = name;
        this.image = image;
        this.ingredients = ingredients;
        this.steps = steps;
        this.sortOrder = sortOrder;
    }

    public RecipeVO toRecipe() {
        return new RecipeVO(id, categoryId, name, image, ingredients, steps, orderCount);
    }
}
