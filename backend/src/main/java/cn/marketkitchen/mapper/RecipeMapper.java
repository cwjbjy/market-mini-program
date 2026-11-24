package cn.marketkitchen.mapper;

import cn.marketkitchen.mapper.model.RecipeRow;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

public interface RecipeMapper extends BaseMapper<RecipeRow> {
    RecipeRow lockRecipe(@Param("id") String id);

    List<RecipeRow> lockRecipes(@Param("ids") Collection<String> ids);

    void incrementOrderCounts(@Param("ids") Collection<String> ids);

    @Select("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM recipes WHERE category_id = #{categoryId}")
    long nextPosition(@Param("categoryId") String categoryId);

    @Select("SELECT id FROM recipes WHERE category_id = #{categoryId} ORDER BY sort_order, id FOR UPDATE")
    List<String> lockOrderedIds(@Param("categoryId") String categoryId);

    @Update("UPDATE recipes SET sort_order = #{position} WHERE id = #{id} AND category_id = #{categoryId}")
    void updatePosition(@Param("categoryId") String categoryId, @Param("id") String id, @Param("position") long position);
}
