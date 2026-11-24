package cn.marketkitchen.controller;

import cn.marketkitchen.domain.Recipe;
import cn.marketkitchen.dto.CatalogDtos.SaveRecipe;
import cn.marketkitchen.service.CategoryService;
import cn.marketkitchen.web.ApiResponse;
import jakarta.validation.Valid;
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
@RequestMapping("/api/recipes")
@RequiredArgsConstructor
public class RecipeController {
    private final CategoryService categoryService;

    @GetMapping("/{id}")
    public ApiResponse<Recipe> get(@PathVariable String id) {
        return ApiResponse.success(categoryService.recipe(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Recipe> create(@Valid @RequestBody SaveRecipe input) {
        return ApiResponse.success(categoryService.createRecipe(input));
    }

    @PutMapping("/{id}")
    public ApiResponse<Recipe> update(@PathVariable String id, @Valid @RequestBody SaveRecipe input) {
        return ApiResponse.success(categoryService.updateRecipe(id, input));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        categoryService.deleteRecipe(id);
        return ApiResponse.success(null);
    }
}
