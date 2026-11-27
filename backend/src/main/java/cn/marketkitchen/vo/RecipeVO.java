package cn.marketkitchen.vo;

public record RecipeVO(String id, String categoryId, String name, String image, String ingredients, CookingInstructions instructions,
                     long orderCount) {
    public RecipeVO withOrderCount(long count) {
        return new RecipeVO(id, categoryId, name, image, ingredients, instructions, count);
    }
}
