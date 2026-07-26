import { env } from "cloudflare:workers";
import type { BookInput, BookRecord, BookStorage, ImageInput, StoredImage } from "./storage-types";

type RuntimeEnv = { DB: D1Database; BOOK_IMAGES: R2Bucket };

function runtime() {
  return env as unknown as RuntimeEnv;
}

async function prepareDatabase(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, author TEXT NOT NULL,
      series TEXT, category TEXT NOT NULL, color TEXT NOT NULL, isbn TEXT, isbn10 TEXT,
      isbn13 TEXT, publisher TEXT, published_date TEXT, description TEXT, page_count INTEGER,
      language TEXT, metadata_source TEXT, recognition_method TEXT,
      recognition_confidence INTEGER, front_image_key TEXT, back_image_key TEXT,
      created_at INTEGER NOT NULL
    )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS librarian_schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL
  )`).run();

  const tableInfo = await db.prepare("PRAGMA table_info(books)").all<{ name: string }>();
  const existing = new Set(tableInfo.results.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["author", "author TEXT NOT NULL DEFAULT 'Unknown author'"],
    ["series", "series TEXT"],
    ["category", "category TEXT NOT NULL DEFAULT 'STEM — To classify'"],
    ["color", "color TEXT NOT NULL DEFAULT '#657994'"],
    ["isbn", "isbn TEXT"],
    ["subtitle", "subtitle TEXT"],
    ["isbn10", "isbn10 TEXT"],
    ["isbn13", "isbn13 TEXT"],
    ["publisher", "publisher TEXT"],
    ["published_date", "published_date TEXT"],
    ["description", "description TEXT"],
    ["page_count", "page_count INTEGER"],
    ["language", "language TEXT"],
    ["metadata_source", "metadata_source TEXT"],
    ["recognition_method", "recognition_method TEXT"],
    ["recognition_confidence", "recognition_confidence INTEGER"],
    ["front_image_key", "front_image_key TEXT"],
    ["back_image_key", "back_image_key TEXT"],
    ["created_at", "created_at INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, definition] of additions) {
    if (!existing.has(name)) await db.prepare(`ALTER TABLE books ADD COLUMN ${definition}`).run();
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS books_sort_idx ON books(category, author, series, title)").run();
  await db.prepare(`INSERT OR IGNORE INTO librarian_schema_migrations
    (version, name, applied_at) VALUES (3, 'durable additive book schema', ?)`).bind(Date.now()).run();
}

const selectSql = `SELECT id, title, COALESCE(subtitle, '') AS subtitle, author,
  COALESCE(series, '') AS series, category, color, COALESCE(isbn, '') AS isbn,
  COALESCE(isbn10, '') AS isbn10, COALESCE(isbn13, '') AS isbn13,
  COALESCE(publisher, '') AS publisher, COALESCE(published_date, '') AS publishedDate,
  COALESCE(description, '') AS description, page_count AS pageCount,
  COALESCE(language, '') AS language, COALESCE(metadata_source, '') AS metadataSource,
  COALESCE(recognition_method, '') AS recognitionMethod,
  COALESCE(recognition_confidence, 0) AS recognitionConfidence, created_at AS createdAt,
  CASE WHEN front_image_key IS NULL THEN NULL ELSE '/api/books/image/' || id || '/front' END AS cover
  FROM books ORDER BY category, author, series, title`;

export const storage: BookStorage = {
  async listBooks() {
    const { DB } = runtime();
    await prepareDatabase(DB);
    const result = await DB.prepare(selectSql).all<BookRecord>();
    return result.results;
  },

  async createBook(input, images) {
    const { DB, BOOK_IMAGES } = runtime();
    await prepareDatabase(DB);
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const frontKey = images.front ? `books/${id}/front` : null;
    const backKey = images.back ? `books/${id}/back` : null;
    if (images.front) await BOOK_IMAGES.put(frontKey!, images.front.bytes, { httpMetadata: { contentType: images.front.contentType } });
    if (images.back) await BOOK_IMAGES.put(backKey!, images.back.bytes, { httpMetadata: { contentType: images.back.contentType } });
    await DB.prepare(`INSERT INTO books (
      id, title, subtitle, author, series, category, color, isbn, isbn10, isbn13,
      publisher, published_date, description, page_count, language, metadata_source,
      recognition_method, recognition_confidence, front_image_key, back_image_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, input.title, input.subtitle, input.author, input.series, input.category, input.color,
      input.isbn, input.isbn10, input.isbn13, input.publisher, input.publishedDate,
      input.description, input.pageCount, input.language, input.metadataSource,
      input.recognitionMethod, input.recognitionConfidence, frontKey, backKey, createdAt,
    ).run();
    return { ...input, id, createdAt, cover: frontKey ? `/api/books/image/${id}/front` : undefined };
  },

  async deleteBook(id) {
    const { DB, BOOK_IMAGES } = runtime();
    await prepareDatabase(DB);
    const result = await DB.prepare("DELETE FROM books WHERE id = ?").bind(id).run();
    await Promise.all([
      BOOK_IMAGES.delete(`books/${id}/front`),
      BOOK_IMAGES.delete(`books/${id}/back`),
    ]);
    return Boolean(result.meta.changes);
  },

  async getImage(id, side) {
    const object = await runtime().BOOK_IMAGES.get(`books/${id}/${side}`);
    if (!object) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType || "application/octet-stream",
      etag: object.httpEtag,
    } satisfies StoredImage;
  },
};

export default storage;
