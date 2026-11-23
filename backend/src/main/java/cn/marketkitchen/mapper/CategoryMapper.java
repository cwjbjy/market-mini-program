package cn.marketkitchen.mapper;

import cn.marketkitchen.mapper.model.CategoryRow;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface CategoryMapper extends BaseMapper<CategoryRow> {
    List<CategoryRow> listWithRecipes();

    CategoryRow findWithRecipes(@Param("id") String id);

    @Select("SELECT id FROM categories WHERE id = #{id} FOR UPDATE")
    String lockId(@Param("id") String id);
}
