package cn.marketkitchen.controller;

import cn.marketkitchen.common.ApiResponse;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.entity.Recipe;
import cn.marketkitchen.service.CatalogService;
import jakarta.validation.Valid;
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
@RequestMapping("/api/recipes")
public class RecipeController {
    private final CatalogService catalog;

    public RecipeController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/{id}")
    public ApiResponse<Recipe> get(@PathVariable String id) {
        return ApiResponse.success(catalog.recipe(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Recipe> create(@Valid @RequestBody SaveRecipe input) {
        return ApiResponse.success(catalog.createRecipe(input));
    }

    @PutMapping("/{id}")
    public ApiResponse<Recipe> update(@PathVariable String id, @Valid @RequestBody SaveRecipe input) {
        return ApiResponse.success(catalog.updateRecipe(id, input));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        catalog.deleteRecipe(id);
        return ApiResponse.success(null);
    }
}
