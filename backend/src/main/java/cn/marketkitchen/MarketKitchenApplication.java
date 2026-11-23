package cn.marketkitchen;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("cn.marketkitchen.mapper")
public class MarketKitchenApplication {
    public static void main(String[] args) {
        SpringApplication.run(MarketKitchenApplication.class, args);
    }
}
