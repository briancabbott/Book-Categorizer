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
  covers?: number[]; authors?: { key: string }[]; subjects?: string[];
  works?: { key: string }[];
};

type OpenLibraryWork = {
  authors?: { author?: { key?: string } }[];
  subjects?: string[];
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

function categoryFor(values: Array<string | undefined> = []) {
  const value = values.join(" ").toLowerCase();
  if (/algorithm|data structure|combinatori|discrete math|graph theor/.test(value)) return "Computer Science — Algorithms & Theory";
  if (/artificial intelligence|machine learning|deep learning|neural network|natural language|computer vision/.test(value)) return "Computer Science — AI & Machine Learning";
  if (/operating system|computer architecture|distributed system|parallel comput|concurren|cloud comput/.test(value)) return "Computer Science — Systems & Architecture";
  if (/programming language|compiler|functional programming|type system|program semantics/.test(value)) return "Computer Science — Programming Languages";
  if (/software engineering|software design|design pattern|testing|devops/.test(value)) return "Computer Science — Software Engineering";
  if (/database|information retrieval|data mining|data management/.test(value)) return "Computer Science — Data & Databases";
  if (/network|cybersecurity|cryptograph|computer security/.test(value)) return "Computer Science — Networks & Security";
  if (/computer science|computing|programming|computer program/.test(value)) return "Computer Science — General";
  if (/linear algebra|abstract algebra|group theor|ring theor|number theor/.test(value)) return "Mathematics — Algebra & Number Theory";
  if (/real analysis|complex analysis|calculus|differential equation|functional analysis/.test(value)) return "Mathematics — Analysis";
  if (/geometry|topology|manifold/.test(value)) return "Mathematics — Geometry & Topology";
  if (/probability|stochastic|statistics|statistical inference/.test(value)) return "Mathematics — Probability & Statistics";
  if (/numerical|optimization|operations research|applied mathematics/.test(value)) return "Mathematics — Applied & Computational";
  if (/mathematical logic|set theory|foundations of mathematics/.test(value)) return "Mathematics — Logic & Foundations";
  if (/mathematics|mathematical/.test(value)) return "Mathematics — General";
  if (/quantum/.test(value)) return "Physics — Quantum Mechanics";
  if (/relativity|gravitation/.test(value)) return "Physics — Relativity & Gravitation";
  if (/electromagnet|electrodynamic/.test(value)) return "Physics — Electromagnetism";
  if (/thermodynamic|statistical mechanics/.test(value)) return "Physics — Thermodynamics & Statistical Mechanics";
  if (/condensed matter|solid state/.test(value)) return "Physics — Condensed Matter";
  if (/optics|photon/.test(value)) return "Physics — Optics & Photonics";
  if (/particle physics|nuclear physics|quantum field/.test(value)) return "Physics — Particle & Nuclear Physics";
  if (/astrophys|cosmolog|astronom/.test(value)) return "Physics — Astrophysics & Cosmology";
  if (/classical mechanics|mechanics|dynamics/.test(value)) return "Physics — Classical Mechanics";
  if (/physics|physical science/.test(value)) return "Physics — General";
  return "STEM — To classify";
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
    category: categoryFor([info.title, info.subtitle, info.description, ...(info.categories || [])]),
    coverUrl: info.imageLinks?.thumbnail?.replace("http://", "https://") || "",
    metadataSource: "google-books", sourceRecordId: volume.id,
    recognitionMethod: method, recognitionConfidence: Math.round(confidence * 100),
  };
}

async function lookupOpenLibrary(isbn: string) {
  const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { headers: openLibraryHeaders });
  if (!response.ok) return undefined;
  const edition = await response.json() as OpenLibraryEdition;
  let authorKeys = (edition.authors || []).map(({ key }) => key);
  if (!authorKeys.length && edition.works?.[0]?.key) {
    const workResponse = await fetch(`https://openlibrary.org${edition.works[0].key}.json`, { headers: openLibraryHeaders });
    if (workResponse.ok) {
      const work = await workResponse.json() as OpenLibraryWork;
      authorKeys = (work.authors || []).map(({ author }) => author?.key || "").filter(Boolean);
      edition.subjects = [...(edition.subjects || []), ...(work.subjects || [])];
    }
  }
  const authorNames = await Promise.all(authorKeys.slice(0, 12).map(async (key) => {
    const authorResponse = await fetch(`https://openlibrary.org${key}.json`, { headers: openLibraryHeaders });
    if (!authorResponse.ok) return "";
    return ((await authorResponse.json()) as { name?: string }).name || "";
  }));
  return { edition, authorNames: authorNames.filter(Boolean) };
}

function normalizeOpenLibrary(
  isbn: string,
  open: Awaited<ReturnType<typeof lookupOpenLibrary>>,
  method: "barcode" | "printed-isbn" | "title-author",
) {
  if (!open) return undefined;
  const { edition, authorNames } = open;
  return {
    title: edition.title || "", subtitle: edition.subtitle || "", author: authorNames.join(", "),
    isbn, isbn10: edition.isbn_10?.[0] || "", isbn13: edition.isbn_13?.[0] || "",
    publisher: edition.publishers?.[0] || "", publishedDate: edition.publish_date || "",
    description: "", pageCount: edition.number_of_pages || null, language: "",
    category: categoryFor([edition.title, edition.subtitle, ...(edition.subjects || [])]),
    coverUrl: edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : "",
    metadataSource: "open-library", sourceRecordId: "", recognitionMethod: method,
    recognitionConfidence: 96,
  };
}

function mergeIsbnMetadata(
  google: ReturnType<typeof normalizeGoogle>,
  open: ReturnType<typeof normalizeOpenLibrary>,
) {
  if (!open) return google;
  const googleAuthors = google.author.split(",").filter(Boolean);
  const openAuthors = open.author.split(",").filter(Boolean);
  return {
    ...open,
    ...google,
    author: openAuthors.length > googleAuthors.length ? open.author : google.author || open.author,
    isbn10: google.isbn10 || open.isbn10,
    isbn13: google.isbn13 || open.isbn13,
    publisher: google.publisher || open.publisher,
    publishedDate: google.publishedDate || open.publishedDate,
    pageCount: google.pageCount || open.pageCount,
    coverUrl: google.coverUrl || open.coverUrl,
    metadataSource: "google-books + open-library",
  };
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

  const openPromise = isbn ? lookupOpenLibrary(isbn).catch(() => undefined) : Promise.resolve(undefined);
  const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&printType=books&maxResults=10`);
  const google = googleResponse.ok ? await googleResponse.json() as { items?: GoogleVolume[] } : {};
  const ranked = (google.items || []).map((volume) => ({ volume, score: isbn ? 1 : overlapScore(ocrText, volume) })).sort((a, b) => b.score - a.score);
  if (ranked[0]) {
    const confidence = isbn ? 0.99 : Math.min(0.94, 0.62 + ranked[0].score * 0.34);
    const googleBook = normalizeGoogle(ranked[0].volume, method, confidence);
    const openBook = isbn ? normalizeOpenLibrary(isbn, await openPromise, method) : undefined;
    return Response.json({
      book: mergeIsbnMetadata(googleBook, openBook),
      candidates: ranked.slice(1, 3).map(({ volume, score }) => normalizeGoogle(volume, "title-author", Math.min(0.9, score))),
    });
  }

  if (isbn) {
    const openBook = normalizeOpenLibrary(isbn, await openPromise, method);
    if (openBook) return Response.json({ book: openBook });
  }
  return Response.json({
    book: null,
    matched: false,
    error: "No matching edition was found for this image.",
  });
}
