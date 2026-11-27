package cn.marketkitchen.dto;

import cn.marketkitchen.vo.CookingInstructions;
import jakarta.validation.Valid;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class CatalogDtos {
    private CatalogDtos() {}

    public record SortOrder(
            @NotNull(message = "请提供调整后的顺序") List<@NotBlank @Size(max = 200) String> ids,
            @NotNull(message = "请提供调整前的顺序") List<@NotBlank @Size(max = 200) String> expectedIds) {}

    public record SaveCategory(
            @NotBlank(message = "请填写分类名称") @Size(max = 80, message = "分类名称不能超过 80 个字符") String name,
            @NotBlank(message = "请选择分类图片") @Size(max = 512, message = "图片路径过长") String image) {}

    public record SaveRecipe(
            @NotBlank(message = "请选择分类") @Size(max = 200, message = "分类标识过长") String categoryId,
            @NotBlank(message = "请填写菜谱名称") @Size(max = 80, message = "菜谱名称不能超过 80 个字符") String name,
            @NotBlank(message = "请选择菜谱图片") @Size(max = 512, message = "图片路径过长") String image,
            @NotBlank(message = "请填写配料") @Size(max = 200, message = "配料不能超过 200 个字符") String ingredients,
            @NotNull(message = "缺少制作步骤数据") @Valid CookingInstructions instructions) {}
}
