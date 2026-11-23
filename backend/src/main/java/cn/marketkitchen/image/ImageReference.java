package cn.marketkitchen.image;

import cn.marketkitchen.exception.BusinessException;
import java.net.URI;
import java.util.regex.Pattern;

public final class ImageReference {
    public static final String PUBLIC_PATH = "/static/images/market/";
    private static final Pattern FILE_NAME = Pattern.compile("[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,195}\\.(png|jpe?g)",
            Pattern.CASE_INSENSITIVE);

    private ImageReference() {}

    public static String validate(String raw) {
        String image = raw.strip();
        if (image.startsWith(PUBLIC_PATH) && isValidFilename(image.substring(PUBLIC_PATH.length()))) {
            return image;
        }
        try {
            URI address = URI.create(image);
            if ("https".equalsIgnoreCase(address.getScheme()) && address.getHost() != null && address.getUserInfo() == null) {
                return image;
            }
        } catch (IllegalArgumentException ignored) {
            // Reject malformed external references with the same validation message.
        }
        throw BusinessException.badRequest("图片路径无效，请重新上传图片");
    }

    static boolean isValidFilename(String name) {
        return FILE_NAME.matcher(name).matches() && !name.contains("..");
    }
}
