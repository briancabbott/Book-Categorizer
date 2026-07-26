import storage from "@/lib/storage";
import type { BookInput, ImageInput } from "@/lib/storage-types";

function text(form: FormData, key: string) {
  return String(form.get(key) || "");
}

function normalizedText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function canonicalIsbn(value: string) {
  const isbn = value.toUpperCase().replace(/[^0-9X]/g, "");
  if (isbn.length !== 10) return isbn.length === 13 ? isbn : "";
  const base = `978${isbn.slice(0, 9)}`;
  const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return `${base}${(10 - (sum % 10)) % 10}`;
}

function isbnSet(book: { isbn?: string; isbn10?: string; isbn13?: string }) {
  return new Set([book.isbn, book.isbn10, book.isbn13].map((value) => canonicalIsbn(value || "")).filter(Boolean));
}

function isDuplicate(
  input: Pick<BookInput, "title" | "author" | "isbn" | "isbn10" | "isbn13">,
  existing: Awaited<ReturnType<typeof storage.listBooks>>[number],
) {
  const incomingIsbns = isbnSet(input);
  const existingIsbns = isbnSet(existing);
  if (incomingIsbns.size && existingIsbns.size) {
    return [...incomingIsbns].some((isbn) => existingIsbns.has(isbn));
  }
  return normalizedText(input.title) === normalizedText(existing.title) &&
    normalizedText(input.author) === normalizedText(existing.author);
}

async function image(form: FormData, key: string): Promise<ImageInput | undefined> {
  const file = form.get(key);
  if (!(file instanceof File) || !file.size) return undefined;
  return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || "application/octet-stream" };
}

export async function GET() {
  try {
    return Response.json(await storage.listBooks());
  } catch (error) {
    console.error("Unable to list books", error);
    return Response.json({
      error: "Unable to load the library.",
      ...(process.env.NODE_ENV === "development" ? { detail: error instanceof Error ? error.message : String(error) } : {}),
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
  const input: BookInput = {
    title: text(form, "title"),
    subtitle: text(form, "subtitle"),
    author: text(form, "author"),
    series: text(form, "series"),
    category: text(form, "category") || "Unsorted",
    color: text(form, "color") || "#657994",
    isbn: text(form, "isbn"),
    isbn10: text(form, "isbn10"),
    isbn13: text(form, "isbn13"),
    publisher: text(form, "publisher"),
    publishedDate: text(form, "publishedDate"),
    description: text(form, "description"),
    pageCount: Number(form.get("pageCount") || 0) || null,
    wordCount: Number(form.get("wordCount") || 0) || null,
    wordCountSource: text(form, "wordCountSource"),
    language: text(form, "language"),
    metadataSource: text(form, "metadataSource"),
    recognitionMethod: text(form, "recognitionMethod"),
    recognitionConfidence: Number(form.get("recognitionConfidence") || 0),
    externalCoverUrl: text(form, "externalCoverUrl"),
  };
  if (!input.title || !input.author) {
    return Response.json({ error: "Title and author are required." }, { status: 422 });
  }
    const duplicate = (await storage.listBooks()).find((book) => isDuplicate(input, book));
    if (duplicate) {
      return Response.json({
        duplicate: true,
        error: `“${duplicate.title}” is already in your library.`,
        existingBookId: duplicate.id,
      });
    }
    const book = await storage.createBook(input, {
      front: await image(form, "front"),
      back: await image(form, "back"),
    });
    return Response.json(book, { status: 201 });
  } catch (error) {
    console.error("Unable to create book", error);
    return Response.json({
      error: "Unable to save the book.",
      ...(process.env.NODE_ENV === "development" ? { detail: error instanceof Error ? error.message : String(error) } : {}),
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; externalCoverUrl?: string };
    if (!body.id || !body.externalCoverUrl) return Response.json({ error: "Book id and cover URL are required." }, { status: 422 });
    const updated = await storage.updateExternalCover(body.id, body.externalCoverUrl);
    if (!updated) return Response.json({ error: "Book not found." }, { status: 404 });
    return Response.json({ updated: true, id: body.id, externalCoverUrl: body.externalCoverUrl });
  } catch (error) {
    return Response.json({ error: "Unable to update the online cover.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "A book id is required." }, { status: 422 });
    const deleted = await storage.deleteBook(id);
    if (!deleted) return Response.json({ error: "Book not found." }, { status: 404 });
    return Response.json({ deleted: true, id });
  } catch (error) {
    console.error("Unable to delete book", error);
    return Response.json({
      error: "Unable to delete the book.",
      ...(process.env.NODE_ENV === "development" ? { detail: error instanceof Error ? error.message : String(error) } : {}),
    }, { status: 500 });
  }
}
