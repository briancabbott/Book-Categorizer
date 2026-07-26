type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; publisher?: string;
    publishedDate?: string; description?: string; categories?: string[];
    pageCount?: number; language?: string; imageLinks?: { thumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
  };
};

type OpenLibraryEdition = {
  title?: string; subtitle?: string; publishers?: string[]; publish_date?: string;
  number_of_pages?: number; isbn_10?: string[]; isbn_13?: string[];
  covers?: number[]; authors?: { key: string }[];
};

const openLibraryHeaders = {
  "User-Agent": "Librarian-Book-Categorizer/1.0 (https://github.com/briancabbott/Book-Categorizer)",
  Accept: "application/json",
};

function cleanIsbn(value: string) {
  return value.toUpperCase().replace(/[^0-9X]/g, "");
}

function validIsbn(value: string) {
  const isbn = cleanIsbn(value);
  if (isbn.length === 13) {
    const sum = isbn.slice(0, 12).split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }
  if (isbn.length === 10) {
    const sum = isbn.split("").reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  return false;
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((word) => word.length > 2));
}

function overlapScore(query: string, volume: GoogleVolume) {
  const wanted = tokens(query);
  const info = volume.volumeInfo;
  const actual = tokens([info?.title, info?.subtitle, ...(info?.authors || [])].filter(Boolean).join(" "));
  if (!wanted.size) return 0;
  let matches = 0;
  wanted.forEach((token) => { if (actual.has(token)) matches += 1; });
  return matches / wanted.size;
}

function categoryFor(values: string[] = []) {
  const value = values.join(" ").toLowerCase();
  if (/science fiction|sci-fi/.test(value)) return "Science fiction";
  if (/fantasy/.test(value)) return "Fantasy";
  if (/mystery|detective|thriller|crime/.test(value)) return "Mystery";
  if (/history/.test(value)) return "History";
  if (/biograph|memoir/.test(value)) return "Biography";
  if (/art|design|architecture/.test(value)) return "Art & design";
  return "Literary fiction";
}

function normalizeGoogle(volume: GoogleVolume, method: "barcode" | "printed-isbn" | "title-author", confidence: number) {
  const info = volume.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn10 = identifiers.find((item) => item.type === "ISBN_10")?.identifier || "";
  const isbn13 = identifiers.find((item) => item.type === "ISBN_13")?.identifier || "";
  return {
    title: info.title || "", subtitle: info.subtitle || "", author: (info.authors || []).join(", "),
    isbn: isbn13 || isbn10, isbn10, isbn13, publisher: info.publisher || "",
    publishedDate: info.publishedDate || "", description: info.description || "",
    pageCount: info.pageCount || null, language: info.language || "",
    category: categoryFor(info.categories),
    coverUrl: info.imageLinks?.thumbnail?.replace("http://", "https://") || "",
    metadataSource: "google-books", sourceRecordId: volume.id,
    recognitionMethod: method, recognitionConfidence: Math.round(confidence * 100),
  };
}

async function lookupOpenLibrary(isbn: string) {
  const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { headers: openLibraryHeaders });
  if (!response.ok) return undefined;
  const edition = await response.json() as OpenLibraryEdition;
  const authorNames = await Promise.all((edition.authors || []).slice(0, 4).map(async ({ key }) => {
    const authorResponse = await fetch(`https://openlibrary.org${key}.json`, { headers: openLibraryHeaders });
    if (!authorResponse.ok) return "";
    return ((await authorResponse.json()) as { name?: string }).name || "";
  }));
  return { edition, authorNames: authorNames.filter(Boolean) };
}

export async function POST(request: Request) {
  const body = await request.json() as { isbn?: string; text?: string; method?: "barcode" | "printed-isbn" | "title-author" };
  const isbn = cleanIsbn(body.isbn || "");
  const method = body.method || (isbn ? "barcode" : "title-author");
  const ocrText = String(body.text || "").slice(0, 1800);
  if (isbn && !validIsbn(isbn)) return Response.json({ error: "The detected ISBN did not pass its checksum." }, { status: 422 });

  const lines = ocrText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 2 && line.length < 100);
  const query = isbn ? `isbn:${isbn}` : lines.slice(0, 5).map((line) => `"${line}"`).join(" ");
  if (!query) return Response.json({ error: "No ISBN or readable cover text was found." }, { status: 422 });

  const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&printType=books&maxResults=10`);
  const google = googleResponse.ok ? await googleResponse.json() as { items?: GoogleVolume[] } : {};
  const ranked = (google.items || []).map((volume) => ({ volume, score: isbn ? 1 : overlapScore(ocrText, volume) })).sort((a, b) => b.score - a.score);
  if (ranked[0]) {
    const confidence = isbn ? 0.99 : Math.min(0.94, 0.62 + ranked[0].score * 0.34);
    return Response.json({
      book: normalizeGoogle(ranked[0].volume, method, confidence),
      candidates: ranked.slice(1, 3).map(({ volume, score }) => normalizeGoogle(volume, "title-author", Math.min(0.9, score))),
    });
  }

  if (isbn) {
    const open = await lookupOpenLibrary(isbn);
    if (open) {
      const { edition, authorNames } = open;
      return Response.json({ book: {
        title: edition.title || "", subtitle: edition.subtitle || "", author: authorNames.join(", "),
        isbn, isbn10: edition.isbn_10?.[0] || "", isbn13: edition.isbn_13?.[0] || "",
        publisher: edition.publishers?.[0] || "", publishedDate: edition.publish_date || "",
        description: "", pageCount: edition.number_of_pages || null, language: "",
        category: "Literary fiction",
        coverUrl: edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : "",
        metadataSource: "open-library", sourceRecordId: "", recognitionMethod: method,
        recognitionConfidence: 96,
      } });
    }
  }
  return Response.json({ error: "No matching edition was found. Try a clearer back-cover photo." }, { status: 404 });
}
