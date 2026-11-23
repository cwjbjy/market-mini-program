package cn.marketkitchen.domain;

public record Recipe(String id, String categoryId, String name, String image, String ingredients, String steps,
                     long orderCount) {
    public Recipe withOrderCount(long count) {
        return new Recipe(id, categoryId, name, image, ingredients, steps, count);
    }
}
