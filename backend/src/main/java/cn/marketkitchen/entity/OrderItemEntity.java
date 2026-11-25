package cn.marketkitchen.entity;

import cn.marketkitchen.vo.OrderVO;

public record OrderItemEntity(int lineNumber, String recipeId, String name, String image, String ingredients,
                           String steps, int quantity) {
    public OrderVO.Item toItem() {
        return new OrderVO.Item(recipeId, name, image, ingredients, steps, quantity);
    }
}
