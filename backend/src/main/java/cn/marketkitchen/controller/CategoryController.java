package cn.marketkitchen.controller;

import cn.marketkitchen.common.ApiResponse;
import cn.marketkitchen.dto.CatalogDtos.SaveCategory;
import cn.marketkitchen.entity.Category;
import cn.marketkitchen.service.CatalogService;
import jakarta.validation.Valid;
import java.util.List;
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
public class CategoryController {
    private final CatalogService catalog;

    public CategoryController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public ApiResponse<List<Category>> list() {
        return ApiResponse.success(catalog.categories());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Category> create(@Valid @RequestBody SaveCategory input) {
        return ApiResponse.success(catalog.createCategory(input));
    }

    @PutMapping("/{id}")
    public ApiResponse<Category> update(@PathVariable String id, @Valid @RequestBody SaveCategory input) {
        return ApiResponse.success(catalog.updateCategory(id, input));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        catalog.deleteCategory(id);
        return ApiResponse.success(null);
    }
}
