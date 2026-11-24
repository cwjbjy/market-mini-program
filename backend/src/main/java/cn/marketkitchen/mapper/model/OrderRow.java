package cn.marketkitchen.mapper.model;

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
public class OrderRow {
    @TableId(type = IdType.INPUT)
    private String id;
    private String displayDate;
    private LocalDateTime createdAt;
    @TableField(exist = false)
    private List<OrderItemRow> items = new ArrayList<>();

    public OrderRow() {}

    public OrderRow(String id, String displayDate, LocalDateTime createdAt) {
        this.id = id;
        this.displayDate = displayDate;
        this.createdAt = createdAt;
    }
}
