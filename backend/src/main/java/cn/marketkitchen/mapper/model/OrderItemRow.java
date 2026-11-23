package cn.marketkitchen.mapper.model;

import cn.marketkitchen.domain.Order;

public record OrderItemRow(int lineNumber, String recipeId, String name, String image, String ingredients,
                           String steps, int quantity) {
    public Order.Item toItem() {
        return new Order.Item(recipeId, name, image, ingredients, steps, quantity);
    }
}
