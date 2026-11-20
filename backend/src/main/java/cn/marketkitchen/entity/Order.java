package cn.marketkitchen.entity;

import java.time.Instant;
import java.util.List;

public record Order(String id, String date, Instant createdAt, List<Item> items) {
    public record Item(String recipeId, String name, String image, String ingredients, String steps, int quantity) {}
}
