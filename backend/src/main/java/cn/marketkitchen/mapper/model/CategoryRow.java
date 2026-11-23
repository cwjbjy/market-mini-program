package cn.marketkitchen.mapper.model;

import cn.marketkitchen.domain.Category;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.util.ArrayList;
import java.util.List;

@TableName("categories")
public class CategoryRow {
    @TableId(type = IdType.INPUT)
    private String id;
    private String name;
    private String image;
    @TableField(exist = false)
    private List<RecipeRow> recipes = new ArrayList<>();

    public CategoryRow() {}

    public CategoryRow(String id, String name, String image) {
        this.id = id;
        this.name = name;
        this.image = image;
    }

    public Category toCategory() {
        return new Category(id, name, image, recipes.stream().map(RecipeRow::toRecipe).toList());
    }
}
