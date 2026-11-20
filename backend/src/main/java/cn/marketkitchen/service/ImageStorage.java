package cn.marketkitchen.service;

import cn.marketkitchen.exception.BusinessException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImageStorage {
    public static final String PUBLIC_PATH = "/static/images/market/";
    private static final long MAX_BYTES = 10 * 1024 * 1024;
    private static final long MAX_PIXELS = 25_000_000;
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private static final Pattern FILE_NAME = Pattern.compile("[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,195}\\.(png|jpe?g)",
            Pattern.CASE_INSENSITIVE);

    private final Path directory;

    public ImageStorage(@Value("${market.upload-dir}") String directory) {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
    }

    public String store(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw BusinessException.badRequest("请选择需要上传的图片");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(HttpStatus.PAYLOAD_TOO_LARGE, "图片不能超过 10 MB");
        }
        String suffix = recognizeFormat(file);
        String name = UUID.randomUUID().toString() + "." + suffix;
        Files.createDirectories(directory);
        Path staged = Files.createTempFile(directory, ".upload-", ".tmp");
        try {
            file.transferTo(staged);
            Files.move(staged, directory.resolve(name));
        } finally {
            Files.deleteIfExists(staged);
        }
        return PUBLIC_PATH + name;
    }

    public ImageFile read(String name) throws IOException {
        if (!validFilename(name)) {
            throw BusinessException.notFound("图片不存在");
        }
        Path path = directory.resolve(name);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw BusinessException.notFound("图片不存在");
        }
        // Some legacy JPEGs were saved under PNG filenames that are still referenced by orders.
        try (var image = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
            byte[] signature = image.readNBytes(PNG_SIGNATURE.length);
            if (Arrays.equals(signature, PNG_SIGNATURE)) {
                return new ImageFile(new FileSystemResource(path), MediaType.IMAGE_PNG);
            }
            if (signature.length >= 3 && signature[0] == (byte) 0xFF
                    && signature[1] == (byte) 0xD8 && signature[2] == (byte) 0xFF) {
                return new ImageFile(new FileSystemResource(path), MediaType.IMAGE_JPEG);
            }
        }
        throw BusinessException.notFound("图片不存在");
    }

    static String validateReference(String raw) {
        String image = raw.strip();
        if (image.startsWith(PUBLIC_PATH) && validFilename(image.substring(PUBLIC_PATH.length()))) {
            return image;
        }
        try {
            URI address = URI.create(image);
            if ("https".equalsIgnoreCase(address.getScheme()) && address.getHost() != null && address.getUserInfo() == null) {
                return image;
            }
        } catch (IllegalArgumentException ignored) {
            // The request can be corrected without changing repository state.
        }
        throw BusinessException.badRequest("图片路径无效，请重新上传图片");
    }

    private static boolean validFilename(String name) {
        return FILE_NAME.matcher(name).matches() && !name.contains("..");
    }

    private static String recognizeFormat(MultipartFile file) {
        try (InputStream stream = file.getInputStream(); var image = ImageIO.createImageInputStream(stream)) {
            var readers = ImageIO.getImageReaders(image);
            if (!readers.hasNext()) {
                throw BusinessException.badRequest("请选择有效的 JPG 或 PNG 图片");
            }
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!"jpeg".equals(format) && !"png".equals(format)) {
                    throw BusinessException.badRequest("请选择有效的 JPG 或 PNG 图片");
                }
                reader.setInput(image, true, true);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) {
                    throw BusinessException.badRequest("图片分辨率过大，请压缩后重试");
                }
                reader.read(0);
                return "jpeg".equals(format) ? "jpg" : "png";
            } finally {
                reader.dispose();
            }
        } catch (IOException error) {
            throw BusinessException.badRequest("图片无法读取，请重新选择");
        }
    }

    public record ImageFile(FileSystemResource resource, MediaType type) {}
}
