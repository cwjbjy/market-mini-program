package cn.marketkitchen.entity;

import cn.marketkitchen.vo.RecipeVO;
import cn.marketkitchen.vo.CookingInstructions;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import cn.marketkitchen.mapper.CookingInstructionsTypeHandler;

@TableName(value = "recipes", autoResultMap = true)
public class RecipeEntity {
    @TableId(type = IdType.INPUT)
    private String id;
    private String categoryId;
    private String name;
    private String image;
    private String ingredients;
    @TableField(typeHandler = CookingInstructionsTypeHandler.class)
    private CookingInstructions instructions;
    private Long orderCount;
    // Written by insert/update and read back by MyBatis mapping; no Java code consumes the value.
    @SuppressWarnings("unused")
    private Long sortOrder;

    public RecipeEntity() {}

    public RecipeEntity(String id, String categoryId, String name, String image, String ingredients, CookingInstructions instructions,
            Long sortOrder) {
        this.id = id;
        this.categoryId = categoryId;
        this.name = name;
        this.image = image;
        this.ingredients = ingredients;
        this.instructions = instructions;
        this.sortOrder = sortOrder;
    }

    public RecipeVO toRecipe() {
        return new RecipeVO(id, categoryId, name, image, ingredients, instructions, orderCount);
    }
}
