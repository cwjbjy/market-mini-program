package cn.marketkitchen.entity;

import cn.marketkitchen.vo.OrderVO;
import cn.marketkitchen.vo.CookingInstructions;

public record OrderItemEntity(int lineNumber, String recipeId, String name, String image, String ingredients,
                           CookingInstructions instructions, int quantity) {
    public OrderVO.Item toItem() {
        return new OrderVO.Item(recipeId, name, image, ingredients, instructions, quantity);
    }
}
