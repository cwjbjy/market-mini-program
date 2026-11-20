package cn.marketkitchen.entity;

public record Recipe(String id, String categoryId, String name, String image, String ingredients, String steps,
                     long orderCount) {}
