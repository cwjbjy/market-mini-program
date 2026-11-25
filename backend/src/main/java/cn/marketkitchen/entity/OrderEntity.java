package cn.marketkitchen.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;

@TableName("orders")
@Getter
public class OrderEntity {
    @TableId(type = IdType.INPUT)
    private String id;
    private String displayDate;
    private LocalDateTime createdAt;
    @TableField(exist = false)
    private List<OrderItemEntity> items = new ArrayList<>();

    public OrderEntity() {}

    public OrderEntity(String id, String displayDate, LocalDateTime createdAt) {
        this.id = id;
        this.displayDate = displayDate;
        this.createdAt = createdAt;
    }
}
