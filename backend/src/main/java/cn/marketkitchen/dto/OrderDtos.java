package cn.marketkitchen.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class OrderDtos {
    private OrderDtos() {}

    public record SubmitOrder(
            @NotBlank(message = "缺少下单标识")
            @Pattern(regexp = "[A-Za-z0-9._-]{1,120}", message = "下单标识格式不正确") String requestId,
            @NotEmpty(message = "请至少选择一种菜谱")
            @Size(max = 500, message = "一笔订单最多包含 500 种菜谱")
            List<@NotNull(message = "订单菜品不能为空") @Valid SubmitItem> items) {}

    public record SubmitItem(
            @NotBlank(message = "缺少菜谱标识") @Size(max = 200, message = "菜谱标识过长") String recipeId,
            @NotNull(message = "缺少菜品数量") @Positive(message = "菜品数量必须大于 0")
            @Max(value = 9999, message = "菜品数量不能超过 9999") Integer quantity) {}
}
