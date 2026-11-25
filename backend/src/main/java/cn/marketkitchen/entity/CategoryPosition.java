package cn.marketkitchen.entity;

/**
 * Row projection of {@code categories} carrying just the identity and the unique {@code sort_order}
 * used while locking and rewriting the menu order; it is never written through a MyBatis-Plus mapper.
 */
public record CategoryPosition(String id, long sortOrder) {}
