package cn.marketkitchen.repository;

import cn.marketkitchen.entity.OrderEntity;
import cn.marketkitchen.entity.OrderItemEntity;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.mapper.OrderMapper;
import cn.marketkitchen.vo.OrderVO;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class OrderRepository {
    private final OrderMapper orders;

    public List<OrderVO> recentOrders() {
        return orders.pageWithItems(50, null).stream().map(OrderRepository::toOrder).toList();
    }

    public OrderVO find(String id) {
        return find(id, false);
    }

    public OrderVO findVisible(String id) {
        return find(id, true);
    }

    private OrderVO find(String id, boolean visibleOnly) {
        OrderEntity row = orders.findWithItems(id, visibleOnly);
        return row == null ? null : toOrder(row);
    }

    public OrderVO.Page page(String cursorId, int size) {
        OrderEntity cursor = null;
        if (cursorId != null) {
            cursor = orders.selectById(cursorId);
            if (cursor == null) throw BusinessException.badRequest("分页位置无效，请刷新订单");
        }
        List<OrderEntity> rows = orders.pageWithItems(size + 1, cursor);
        List<OrderVO> items = rows.stream().limit(size).map(OrderRepository::toOrder).toList();
        return new OrderVO.Page(items, rows.size() > size ? items.get(size - 1).id() : null);
    }

    public void insert(String id, String displayDate, Instant createdAt) {
        orders.insert(new OrderEntity(id, displayDate, utc(createdAt)));
    }

    public void insertItems(OrderVO order) {
        orders.insertItems(order.id(), order.items());
    }

    public boolean hideOrder(String id, Instant now) {
        return orders.hide(id, utc(now)) == 1 || orders.selectById(id) != null;
    }

    private static LocalDateTime utc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private static OrderVO toOrder(OrderEntity row) {
        LocalDateTime timestamp = row.getCreatedAt();
        Instant createdAt = timestamp == null ? null : timestamp.toInstant(ZoneOffset.UTC);
        String date = row.getDisplayDate();
        if (date.isBlank() && createdAt != null) {
            date = OrderVO.formatDisplayDate(createdAt);
        }
        return new OrderVO(row.getId(), date, createdAt, row.getItems().stream().map(OrderItemEntity::toItem).toList());
    }
}
