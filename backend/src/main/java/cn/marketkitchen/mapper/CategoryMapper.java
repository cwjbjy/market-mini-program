package cn.marketkitchen.mapper;

import cn.marketkitchen.entity.CategoryEntity;
import cn.marketkitchen.entity.CategoryPosition;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

public interface CategoryMapper extends BaseMapper<CategoryEntity> {
    List<CategoryEntity> listWithRecipes();

    CategoryEntity findWithRecipes(@Param("id") String id);

    @Select("SELECT id FROM categories WHERE id = #{id} FOR UPDATE")
    String lockId(@Param("id") String id);

    @Select("SELECT id, sort_order FROM categories ORDER BY sort_order FOR UPDATE")
    @ConstructorArgs({@Arg(column = "id", javaType = String.class), @Arg(column = "sort_order", javaType = long.class)})
    List<CategoryPosition> lockPositions();

    @Update("UPDATE categories SET sort_order = #{position} WHERE id = #{id}")
    void updatePosition(@Param("id") String id, @Param("position") long position);
}
