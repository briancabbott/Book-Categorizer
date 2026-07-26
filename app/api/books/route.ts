import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  BOOK_IMAGES: R2Bucket;
};

async function prepareDatabase(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT,
      author TEXT NOT NULL,
      series TEXT,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      isbn TEXT,
      isbn10 TEXT,
      isbn13 TEXT,
      publisher TEXT,
      published_date TEXT,
      description TEXT,
      page_count INTEGER,
      language TEXT,
      metadata_source TEXT,
      recognition_method TEXT,
      recognition_confidence INTEGER,
      front_image_key TEXT,
      back_image_key TEXT,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS books_sort_idx ON books(category, author, series, title)"),
  ]);
}

export async function GET() {
  const runtime = env as unknown as RuntimeEnv;
  await prepareDatabase(runtime.DB);
  const result = await runtime.DB.prepare(
    `SELECT id, title, COALESCE(subtitle, '') AS subtitle, author, COALESCE(series, '') AS series,
      category, color, COALESCE(isbn, '') AS isbn, COALESCE(isbn10, '') AS isbn10,
      COALESCE(isbn13, '') AS isbn13, COALESCE(publisher, '') AS publisher,
      COALESCE(published_date, '') AS publishedDate, COALESCE(description, '') AS description,
      page_count AS pageCount, COALESCE(language, '') AS language,
      COALESCE(metadata_source, '') AS metadataSource,
      COALESCE(recognition_method, '') AS recognitionMethod,
      COALESCE(recognition_confidence, 0) AS recognitionConfidence,
      CASE WHEN front_image_key IS NULL THEN NULL ELSE '/api/books/image/' || id || '/front' END AS cover
     FROM books ORDER BY category, author, series, title`
  ).all();
  return Response.json(result.results);
}

export async function POST(request: Request) {
  const runtime = env as unknown as RuntimeEnv;
  await prepareDatabase(runtime.DB);
  const form = await request.formData();
  const id = crypto.randomUUID();
  const front = form.get("front");
  const back = form.get("back");
  const frontKey = front instanceof File ? `books/${id}/front` : null;
  const backKey = back instanceof File ? `books/${id}/back` : null;

  if (front instanceof File) await runtime.BOOK_IMAGES.put(frontKey!, front.stream(), { httpMetadata: { contentType: front.type } });
  if (back instanceof File) await runtime.BOOK_IMAGES.put(backKey!, back.stream(), { httpMetadata: { contentType: back.type } });

  await runtime.DB.prepare(
    `INSERT INTO books (
      id, title, subtitle, author, series, category, color, isbn, isbn10, isbn13,
      publisher, published_date, description, page_count, language, metadata_source,
      recognition_method, recognition_confidence, front_image_key, back_image_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    String(form.get("title") || ""),
    String(form.get("subtitle") || ""),
    String(form.get("author") || ""),
    String(form.get("series") || ""),
    String(form.get("category") || "Unsorted"),
    String(form.get("color") || "#657994"),
    String(form.get("isbn") || ""),
    String(form.get("isbn10") || ""),
    String(form.get("isbn13") || ""),
    String(form.get("publisher") || ""),
    String(form.get("publishedDate") || ""),
    String(form.get("description") || ""),
    Number(form.get("pageCount") || 0) || null,
    String(form.get("language") || ""),
    String(form.get("metadataSource") || ""),
    String(form.get("recognitionMethod") || ""),
    Number(form.get("recognitionConfidence") || 0),
    frontKey,
    backKey,
    Date.now()
  ).run();

  return Response.json({ id }, { status: 201 });
}
