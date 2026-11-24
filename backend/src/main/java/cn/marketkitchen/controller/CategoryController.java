package cn.marketkitchen.controller;

import cn.marketkitchen.domain.Category;
import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.dto.CatalogDtos.SortOrder;
import cn.marketkitchen.service.CategoryService;
import cn.marketkitchen.web.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {
    private final CategoryService categoryService;

    @GetMapping
    public ApiResponse<List<Category>> list() {
        return ApiResponse.success(categoryService.categories());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Category> create(@Valid @RequestBody SaveCategory input) {
        return ApiResponse.success(categoryService.createCategory(input));
    }

    @PutMapping("/order/batch")
    public ApiResponse<Void> reorder(@Valid @RequestBody SortOrder input) {
        categoryService.reorderCategories(input);
        return ApiResponse.success(null);
    }

    @PutMapping("/{id}/recipes/order")
    public ApiResponse<Void> reorderRecipes(@PathVariable String id, @Valid @RequestBody SortOrder input) {
        categoryService.reorderRecipes(id, input);
        return ApiResponse.success(null);
    }

    @PutMapping("/{id}")
    public ApiResponse<Category> update(@PathVariable String id, @Valid @RequestBody SaveCategory input) {
        return ApiResponse.success(categoryService.updateCategory(id, input));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        categoryService.deleteCategory(id);
        return ApiResponse.success(null);
    }
}
