package cn.marketkitchen.mapper;

import cn.marketkitchen.entity.OrderEntity;
import cn.marketkitchen.vo.OrderVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface OrderMapper extends BaseMapper<OrderEntity> {
    List<OrderEntity> recentWithItems();

    OrderEntity findWithItems(@Param("id") String id);

    void insertItems(@Param("orderId") String orderId, @Param("items") List<OrderVO.Item> items);

    @Update("UPDATE orders SET deleted_at = COALESCE(deleted_at, #{now}) WHERE id = #{id}")
    int hide(@Param("id") String id, @Param("now") LocalDateTime now);
}
