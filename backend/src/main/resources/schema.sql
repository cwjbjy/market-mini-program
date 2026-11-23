CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(200) PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    image VARCHAR(512) NOT NULL,
    sort_order BIGINT NOT NULL AUTO_INCREMENT UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS recipes (
    id VARCHAR(200) PRIMARY KEY,
    category_id VARCHAR(200) NOT NULL,
    name VARCHAR(80) NOT NULL,
    image VARCHAR(512) NOT NULL,
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL,
    order_count BIGINT NOT NULL DEFAULT 0,
    sort_order BIGINT NOT NULL,
    INDEX recipes_category_order (category_id, sort_order),
    CONSTRAINT recipes_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(200) PRIMARY KEY,
    display_date VARCHAR(128) NOT NULL,
    created_at DATETIME(3) NULL,
    deleted_at DATETIME(3) NULL,
    INDEX orders_recent (deleted_at, created_at DESC, id DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE IF NOT EXISTS order_items (
    order_id VARCHAR(200) NOT NULL,
    line_number INT NOT NULL,
    recipe_id VARCHAR(200) NOT NULL,
    name VARCHAR(80) NOT NULL,
    image VARCHAR(512) NOT NULL,
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL,
    quantity INT NOT NULL,
    PRIMARY KEY (order_id, line_number),
    CONSTRAINT order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
