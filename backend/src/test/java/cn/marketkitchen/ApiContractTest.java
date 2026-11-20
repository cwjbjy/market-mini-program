package cn.marketkitchen;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.marketkitchen.controller.CategoryController;
import cn.marketkitchen.controller.ImageController;
import cn.marketkitchen.controller.OrderController;
import cn.marketkitchen.controller.RecipeController;
import cn.marketkitchen.entity.Category;
import cn.marketkitchen.entity.Recipe;
import cn.marketkitchen.exception.BusinessException;
import cn.marketkitchen.exception.GlobalExceptionHandler;
import cn.marketkitchen.service.CatalogService;
import cn.marketkitchen.service.ImageStorage;
import cn.marketkitchen.service.OrderService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ApiContractTest {
    @TempDir
    Path storage;
    private CatalogService catalog;
    private OrderService orders;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        catalog = mock(CatalogService.class);
        orders = mock(OrderService.class);
        mvc = MockMvcBuilders.standaloneSetup(new CategoryController(catalog), new RecipeController(catalog),
                        new OrderController(orders), new ImageController(new ImageStorage(storage.toString())))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void listsCategoriesWithNativeFieldNames() throws Exception {
        var recipe = new Recipe("r1", "c1", "土豆丝", "/static/images/market/potato.jpg", "土豆", "切丝炒熟", 4);
        when(catalog.categories()).thenReturn(List.of(new Category("c1", "家常菜", recipe.image(), List.of(recipe))));
        mvc.perform(get("/api/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data[0].recipes[0].categoryId").value("c1"))
                .andExpect(jsonPath("$.data[0].recipes[0].ingredients").value("土豆"))
                .andExpect(jsonPath("$.data[0].recipes[0].orderCount").value(4));
    }

    @Test
    void reportsBadInputAndBusinessErrorsInTheEnvelope() throws Exception {
        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content("""
                {"requestId":"one","items":[{"recipeId":"r1","quantity":0}]}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("菜品数量必须大于 0"));
        verifyNoInteractions(orders);

        when(catalog.recipe("missing")).thenThrow(BusinessException.notFound("菜谱不存在"));
        mvc.perform(get("/api/recipes/missing")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("菜谱不存在"));

        when(orders.submit(any())).thenThrow(BusinessException.conflict("有菜谱已删除，请刷新菜单后重新下单"));
        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content("""
                {"requestId":"one","items":[{"recipeId":"r1","quantity":1}]}
                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(409));
    }

    @Test
    void uploadsAndServesActualImageTypeAndRejectsFakeImages() throws Exception {
        byte[] png;
        try (var output = new ByteArrayOutputStream()) {
            ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", output);
            png = output.toByteArray();
        }
        var image = new MockMultipartFile("file", "../../name.jpg", MediaType.IMAGE_JPEG_VALUE, png);
        String response = mvc.perform(multipart("/api/images").file(image))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.path").isString()).andReturn().getResponse().getContentAsString();
        String path = new ObjectMapper().readTree(response).at("/data/path").asText();
        mvc.perform(get(path)).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(png));

        var fake = new MockMultipartFile("file", "bad.png", MediaType.IMAGE_PNG_VALUE, new byte[]{1, 2, 3});
        mvc.perform(multipart("/api/images").file(fake)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
        mvc.perform(get("/static/images/market/missing.png")).andExpect(status().isNotFound());
    }

    @Test
    void servesMigratedJpegAtItsOriginalPngPath() throws Exception {
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "jpeg",
                storage.resolve("legacy.png").toFile());
        mvc.perform(get("/static/images/market/legacy.png")).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG));
    }
}
