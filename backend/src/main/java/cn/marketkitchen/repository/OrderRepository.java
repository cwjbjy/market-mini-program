package cn.marketkitchen.repository;

import cn.marketkitchen.domain.Order;
import cn.marketkitchen.mapper.OrderMapper;
import cn.marketkitchen.mapper.model.OrderItemRow;
import cn.marketkitchen.mapper.model.OrderRow;
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

    public List<Order> recentOrders() {
        return orders.recentWithItems().stream().map(OrderRepository::toOrder).toList();
    }

    public Order find(String id) {
        OrderRow row = orders.findWithItems(id);
        return row == null ? null : toOrder(row);
    }

    public void insert(String id, String displayDate, Instant createdAt) {
        orders.insert(new OrderRow(id, displayDate, utc(createdAt)));
    }

    public void insertItems(Order order) {
        orders.insertItems(order.id(), order.items());
    }

    public boolean hideOrder(String id, Instant now) {
        return orders.hide(id, utc(now)) == 1 || orders.selectById(id) != null;
    }

    private static LocalDateTime utc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private static Order toOrder(OrderRow row) {
        LocalDateTime timestamp = row.getCreatedAt();
        Instant createdAt = timestamp == null ? null : timestamp.toInstant(ZoneOffset.UTC);
        String date = row.getDisplayDate();
        if (date.isBlank() && createdAt != null) {
            date = Order.formatDisplayDate(createdAt);
        }
        return new Order(row.getId(), date, createdAt, row.getItems().stream().map(OrderItemRow::toItem).toList());
    }
}
