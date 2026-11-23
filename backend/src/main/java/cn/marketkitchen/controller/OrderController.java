package cn.marketkitchen.controller;

import cn.marketkitchen.domain.Order;
import cn.marketkitchen.dto.OrderDtos.SubmitOrder;
import cn.marketkitchen.service.OrderService;
import cn.marketkitchen.web.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @GetMapping
    public ApiResponse<List<Order>> list() {
        return ApiResponse.success(orders.recentOrders());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Order> submit(@Valid @RequestBody SubmitOrder input) {
        return ApiResponse.success(orders.submit(input));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        orders.delete(id);
        return ApiResponse.success(null);
    }
}
