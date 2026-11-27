package cn.marketkitchen.mapper;

import cn.marketkitchen.vo.CookingInstructions;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

public class CookingInstructionsTypeHandler extends BaseTypeHandler<CookingInstructions> {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public void setNonNullParameter(PreparedStatement statement, int index, CookingInstructions instructions, JdbcType type)
            throws SQLException {
        try {
            statement.setString(index, JSON.writeValueAsString(instructions));
        } catch (JsonProcessingException error) {
            throw new SQLException("无法序列化制作步骤", error);
        }
    }

    @Override
    public CookingInstructions getNullableResult(ResultSet result, String column) throws SQLException {
        return decode(result.getString(column));
    }

    @Override
    public CookingInstructions getNullableResult(ResultSet result, int column) throws SQLException {
        return decode(result.getString(column));
    }

    @Override
    public CookingInstructions getNullableResult(CallableStatement statement, int column) throws SQLException {
        return decode(statement.getString(column));
    }

    private static CookingInstructions decode(String value) throws SQLException {
        try {
            return value == null ? null : JSON.readValue(value, CookingInstructions.class);
        } catch (JsonProcessingException error) {
            throw new SQLException("无法读取制作步骤", error);
        }
    }
}
