import storage from "@/lib/storage";
import type { BookInput, ImageInput } from "@/lib/storage-types";

function text(form: FormData, key: string) {
  return String(form.get(key) || "");
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
    language: text(form, "language"),
    metadataSource: text(form, "metadataSource"),
    recognitionMethod: text(form, "recognitionMethod"),
    recognitionConfidence: Number(form.get("recognitionConfidence") || 0),
  };
  if (!input.title || !input.author) {
    return Response.json({ error: "Title and author are required." }, { status: 422 });
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
