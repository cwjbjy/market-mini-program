package cn.marketkitchen.service;

import cn.marketkitchen.dto.OrderDtos.SubmitOrder;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.repository.CategoryRepository;
import cn.marketkitchen.repository.OrderRepository;
import cn.marketkitchen.vo.OrderVO;
import cn.marketkitchen.vo.RecipeVO;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class OrderService {
    private static final int PAGE_SIZE = 15;
    private final CategoryRepository categoryRepository;
    private final OrderRepository orderRepository;
    private final TransactionTemplate transactions;

    public List<OrderVO> recentOrders() {
        return orderRepository.recentOrders();
    }

    public OrderVO.Page page(String cursor) {
        return orderRepository.page(cursor, PAGE_SIZE);
    }

    public OrderVO detail(String id) {
        OrderVO order = orderRepository.findVisible(id);
        if (order == null) throw BusinessException.notFound("订单不存在");
        return order;
    }

    public OrderVO submit(SubmitOrder input) {
        var quantities = new LinkedHashMap<String, Integer>();
        for (var selection : input.items()) {
            if (quantities.putIfAbsent(selection.recipeId(), selection.quantity()) != null) {
                throw BusinessException.badRequest("同一菜谱只能添加一次");
            }
        }

        String id = "order:" + input.requestId();
        try {
            return transactions.execute(status -> {
                Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
                String date = OrderVO.formatDisplayDate(now);
                // Reserve the idempotency key before locking recipes or updating any counters.
                orderRepository.insert(id, date, now);
                Map<String, RecipeVO> recipes = categoryRepository.lockRecipes(quantities.keySet()).stream()
                        .collect(Collectors.toMap(RecipeVO::id, recipe -> recipe));
                if (recipes.size() != quantities.size()) {
                    throw BusinessException.conflict("有菜谱已删除，请刷新菜单后重新下单");
                }
                var items = quantities.entrySet().stream().map(selection -> {
                    RecipeVO recipe = recipes.get(selection.getKey());
                    return new OrderVO.Item(recipe.id(), recipe.name(), recipe.image(), recipe.ingredients(),
                            recipe.instructions(), selection.getValue());
                }).toList();
                var order = new OrderVO(id, date, now, items);
                orderRepository.insertItems(order);
                categoryRepository.incrementOrderCounts(quantities.keySet());
                return order;
            });
        } catch (DuplicateKeyException error) {
            OrderVO previous = orderRepository.find(id);
            if (previous == null) {
                throw error;
            }
            return replay(previous, quantities);
        }
    }

    public void delete(String id) {
        if (!orderRepository.hideOrder(id, Instant.now())) {
            throw BusinessException.notFound("订单不存在");
        }
    }

    private static OrderVO replay(OrderVO previous, Map<String, Integer> requested) {
        var previousItems = new HashMap<String, Integer>();
        for (var item : previous.items()) {
            previousItems.put(item.recipeId(), item.quantity());
        }
        if (!previousItems.equals(requested)) {
            throw BusinessException.conflict("相同的下单标识已用于其他菜品或数量");
        }
        return previous;
    }
}
