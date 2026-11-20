package cn.marketkitchen.service;

import cn.marketkitchen.config.MongoTransactions;
import cn.marketkitchen.dto.OrderDtos.SubmitOrder;
import cn.marketkitchen.entity.Order;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.mapper.CatalogMapper;
import cn.marketkitchen.mapper.OrderMapper;
import cn.marketkitchen.mapper.OrderMapper.StoredOrder;
import com.mongodb.MongoException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final CatalogMapper catalog;
    private final OrderMapper orders;
    private final MongoTransactions transactions;

    public OrderService(CatalogMapper catalog, OrderMapper orders, MongoTransactions transactions) {
        this.catalog = catalog;
        this.orders = orders;
        this.transactions = transactions;
    }

    public List<Order> recentOrders() {
        return orders.recentOrders();
    }

    public Order submit(SubmitOrder input) {
        var quantities = new LinkedHashMap<String, Integer>();
        for (var selection : input.items()) {
            if (quantities.putIfAbsent(selection.recipeId(), selection.quantity()) != null) {
                throw BusinessException.badRequest("同一菜谱只能添加一次");
            }
        }
        try {
            return transactions.run(session -> {
                StoredOrder previous = orders.findByRequestId(session, input.requestId());
                if (previous != null) {
                    return replay(previous, quantities);
                }

                var items = new ArrayList<Order.Item>();
                var resolvedIds = new HashSet<String>();
                for (var selection : quantities.entrySet()) {
                    var stored = catalog.findStoredRecipe(session, selection.getKey());
                    if (stored == null) {
                        throw BusinessException.conflict("有菜谱已删除，请刷新菜单后重新下单");
                    }
                    var recipe = stored.recipe();
                    if (!resolvedIds.add(recipe.id())) {
                        throw BusinessException.badRequest("同一菜谱只能添加一次");
                    }
                    items.add(new Order.Item(recipe.id(), recipe.name(), recipe.image(), recipe.ingredients(),
                            recipe.steps(), selection.getValue()));
                    catalog.incrementOrderCount(session, stored);
                }
                Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
                String date = OrderMapper.DISPLAY_TIME.format(now.atZone(OrderMapper.DISPLAY_ZONE));
                Order order = new Order(OrderMapper.idForRequest(input.requestId()), date, now, List.copyOf(items));
                orders.insert(session, order, quantities);
                return order;
            });
        } catch (MongoException error) {
            if (error.getCode() == 11000) {
                // Concurrent submissions can collide on the order ID before either reads the other.
                StoredOrder previous = orders.findByRequestId(null, input.requestId());
                if (previous != null) {
                    return replay(previous, quantities);
                }
            }
            throw error;
        }
    }

    public void delete(String id) {
        if (!orders.hideOrder(id, Instant.now())) {
            throw BusinessException.notFound("订单不存在");
        }
    }

    private static Order replay(StoredOrder previous, Map<String, Integer> requested) {
        if (!previous.requestedItems().equals(requested)) {
            throw BusinessException.conflict("相同的下单标识已用于其他菜品或数量");
        }
        return previous.order();
    }
}
