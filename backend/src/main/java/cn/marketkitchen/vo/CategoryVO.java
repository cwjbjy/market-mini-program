package cn.marketkitchen.vo;

import java.util.List;

public record CategoryVO(String id, String name, String image, List<RecipeVO> recipes) {}
