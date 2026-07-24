import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  series: text("series"),
  category: text("category").notNull(),
  color: text("color").notNull(),
  isbn: text("isbn"),
  frontImageKey: text("front_image_key"),
  backImageKey: text("back_image_key"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
