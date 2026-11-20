package cn.marketkitchen.config;

import com.mongodb.ReadConcern;
import com.mongodb.TransactionOptions;
import com.mongodb.WriteConcern;
import com.mongodb.client.ClientSession;
import com.mongodb.client.MongoClient;
import java.util.function.Function;
import org.springframework.stereotype.Component;

@Component
public class MongoTransactions {
    private static final TransactionOptions OPTIONS = TransactionOptions.builder()
            .readConcern(ReadConcern.SNAPSHOT)
            .writeConcern(WriteConcern.MAJORITY)
            .build();

    private final MongoClient client;

    public MongoTransactions(MongoClient client) {
        this.client = client;
    }

    public <T> T run(Function<ClientSession, T> action) {
        try (ClientSession session = client.startSession()) {
            return session.withTransaction(() -> action.apply(session), OPTIONS);
        }
    }
}
