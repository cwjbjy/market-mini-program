package cn.marketkitchen.entity;

import cn.marketkitchen.vo.CategoryVO;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.util.ArrayList;
import java.util.List;

@TableName("categories")
public class CategoryEntity {
    @TableId(type = IdType.INPUT)
    private String id;
    private String name;
    private String image;
    @TableField(exist = false)
    private List<RecipeEntity> recipes = new ArrayList<>();

    public CategoryEntity() {}

    public CategoryEntity(String id, String name, String image) {
        this.id = id;
        this.name = name;
        this.image = image;
    }

    public CategoryVO toCategory() {
        return new CategoryVO(id, name, image, recipes.stream().map(RecipeEntity::toRecipe).toList());
    }
}
