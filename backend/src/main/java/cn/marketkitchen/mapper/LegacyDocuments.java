package cn.marketkitchen.mapper;

import static com.mongodb.client.model.Filters.in;
import static com.mongodb.client.model.Filters.or;

import java.util.List;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.bson.types.ObjectId;

/** BSON helpers for records created by either of the previous servers. */
final class LegacyDocuments {
    private LegacyDocuments() {}

    static Bson idFilter(String field, String id) {
        return in(field, idValues(id));
    }

    static Bson embeddedIdFilter(String id) {
        return or(idFilter("_id", id), idFilter("id", id));
    }

    static boolean matchesEmbeddedId(Document document, String id) {
        return matchesId(document.get("_id"), id) || matchesId(document.get("id"), id);
    }

    static boolean matchesId(Object raw, String id) {
        return raw != null && idValues(id).contains(raw);
    }

    static String id(Document document) {
        Object raw = document.get("_id");
        return idText(raw == null ? document.get("id") : raw);
    }

    static String idText(Object raw) {
        if (raw instanceof ObjectId objectId) {
            return objectId.toHexString();
        }
        return raw instanceof String string ? string : "";
    }

    static List<Document> children(Document document, String field) {
        List<Document> values = document.getList(field, Document.class);
        return values == null ? List.of() : values;
    }

    static String text(Document document, String field) {
        return document.get(field) instanceof String value ? value : "";
    }

    static Number number(Document document, String field) {
        return document.get(field) instanceof Number value ? value : 0;
    }

    private static List<Object> idValues(String id) {
        return ObjectId.isValid(id) ? List.of(id, new ObjectId(id)) : List.of(id);
    }
}
