package cn.marketkitchen.vo;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CookingInstructions(
        @NotNull @Size(max = 50) List<@NotNull @Valid Step> steps,
        @NotNull @Size(max = 20) List<@NotBlank @Size(max = 500) String> tips) {
    public record Step(@NotBlank @Size(max = 80) String id, @NotBlank @Size(max = 500) String text) {}
}
