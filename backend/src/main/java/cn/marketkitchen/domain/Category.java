package cn.marketkitchen.domain;

import java.util.List;

public record Category(String id, String name, String image, List<Recipe> recipes) {}
