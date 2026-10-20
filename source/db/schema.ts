import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const quoteNumbers = sqliteTable("quote_numbers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});
