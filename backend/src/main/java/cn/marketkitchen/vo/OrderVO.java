package cn.marketkitchen.vo;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

public record OrderVO(String id, String date, Instant createdAt, List<Item> items) {
    private static final DateTimeFormatter DISPLAY_DATE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.ROOT).withZone(ZoneId.of("Asia/Shanghai"));

    public static String formatDisplayDate(Instant instant) {
        return DISPLAY_DATE.format(instant);
    }

    public record Item(String recipeId, String name, String image, String ingredients, CookingInstructions instructions, int quantity) {}

    public record Page(List<OrderVO> orders, String nextCursor) {}
}
