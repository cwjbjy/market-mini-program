package cn.marketkitchen.controller;

import cn.marketkitchen.image.ImageReference;
import cn.marketkitchen.image.LocalImageStorage;
import cn.marketkitchen.web.ApiResponse;
import java.io.IOException;
import java.time.Duration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class ImageController {
    private final LocalImageStorage images;

    public ImageController(LocalImageStorage images) {
        this.images = images;
    }

    @PostMapping(value = "/api/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<UploadedImage> upload(@RequestParam("file") MultipartFile file) throws IOException {
        return ApiResponse.success(new UploadedImage(images.store(file)));
    }

    @GetMapping(ImageReference.PUBLIC_PATH + "{filename}")
    public ResponseEntity<Resource> get(@PathVariable String filename) throws IOException {
        var image = images.read(filename);
        return ResponseEntity.ok().contentType(image.type()).header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic()).body(image.resource());
    }

    public record UploadedImage(String path) {}
}
