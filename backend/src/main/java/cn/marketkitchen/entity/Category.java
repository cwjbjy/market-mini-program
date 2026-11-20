package cn.marketkitchen.entity;

import java.util.List;

public record Category(String id, String name, String image, List<Recipe> recipes) {}
