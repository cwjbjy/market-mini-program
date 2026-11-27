package db.migration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.IntStream;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

public class V3__backfill_cooking_instructions extends BaseJavaMigration {
    private static final Pattern NUMBERING = Pattern.compile(
            "^(?:第[\\d一二三四五六七八九十]+步\\s*[:：、.]?|\\d+[、.．)）](?!\\d)|[一二三四五六七八九十]+、)\\s*");

    public record Conversion(String original, List<String> steps, List<String> tips) {}
    public record Step(String id, String text) {}
    public record Instructions(List<Step> steps, List<String> tips) {}

    @Override
    public Integer getChecksum() {
        return 1;
    }

    @Override
    public void migrate(Context context) throws Exception {
        var json = new ObjectMapper();
        Map<String, Conversion> curated;
        try (var resource = V3__backfill_cooking_instructions.class.getResourceAsStream("/db/recipe-instructions-v3.json")) {
            curated = json.readValue(resource, new TypeReference<>() {});
        }
        Connection connection = context.getConnection();
        try (var select = connection.prepareStatement("SELECT id, steps FROM recipes WHERE instructions IS NULL");
                var update = connection.prepareStatement("UPDATE recipes SET instructions = ? WHERE id = ?");
                var rows = select.executeQuery()) {
            while (rows.next()) {
                String id = rows.getString("id");
                String original = rows.getString("steps");
                Conversion candidate = curated.get(id);
                Instructions instructions = candidate != null && original != null && candidate.original().equals(original.strip())
                        ? numbered(candidate.steps(), candidate.tips()) : convert(original);
                update.setString(1, json.writeValueAsString(instructions));
                update.setString(2, id);
                update.addBatch();
            }
            update.executeBatch();
        }
        try (var select = connection.prepareStatement("SELECT order_id, line_number, steps FROM order_items WHERE instructions IS NULL");
                var update = connection.prepareStatement("UPDATE order_items SET instructions = ? WHERE order_id = ? AND line_number = ?");
                var rows = select.executeQuery()) {
            int count = 0;
            while (rows.next()) {
                update.setString(1, json.writeValueAsString(convert(rows.getString("steps"))));
                update.setString(2, rows.getString("order_id"));
                update.setInt(3, rows.getInt("line_number"));
                update.addBatch();
                if (++count % 250 == 0) update.executeBatch();
            }
            if (count % 250 != 0) update.executeBatch();
        }
    }

    private static Instructions convert(String original) {
        if (original == null || original.isBlank() || original.strip().equals("无")) {
            return numbered(List.of(), List.of());
        }
        var steps = original.lines().map(String::strip).filter(line -> !line.isEmpty())
                .map(line -> {
                    String text = NUMBERING.matcher(line).replaceFirst("");
                    return text.isBlank() ? line : text;
                }).toList();
        return numbered(steps, List.of());
    }

    private static Instructions numbered(List<String> steps, List<String> tips) {
        return new Instructions(IntStream.range(0, steps.size())
                .mapToObj(index -> new Step("step-" + (index + 1), steps.get(index))).toList(), tips);
    }
}
