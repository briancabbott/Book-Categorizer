"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Book = {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  series: string;
  category: string;
  color: string;
  cover?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number | null;
  language?: string;
  metadataSource?: string;
  recognitionMethod?: string;
  recognitionConfidence?: number;
};

type RecognizedBook = Omit<Book, "id" | "series" | "color" | "cover"> & {
  coverUrl?: string;
  sourceRecordId?: string;
};

type ScanCandidate = {
  book: RecognizedBook;
  scanId: number;
  priority: number;
};

const starterBooks: Book[] = [
  { id: "1", title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", series: "Hainish Cycle", category: "Science fiction", color: "#cd725c" },
  { id: "2", title: "The Dispossessed", author: "Ursula K. Le Guin", series: "Hainish Cycle", category: "Science fiction", color: "#edb458" },
  { id: "3", title: "A Wizard of Earthsea", author: "Ursula K. Le Guin", series: "Earthsea", category: "Fantasy", color: "#568f78" },
  { id: "4", title: "The Tombs of Atuan", author: "Ursula K. Le Guin", series: "Earthsea", category: "Fantasy", color: "#657994" },
  { id: "5", title: "The Farthest Shore", author: "Ursula K. Le Guin", series: "Earthsea", category: "Fantasy", color: "#7d5a68" },
  { id: "6", title: "Kindred", author: "Octavia E. Butler", series: "", category: "Science fiction", color: "#a64b45" },
  { id: "7", title: "Parable of the Sower", author: "Octavia E. Butler", series: "Earthseed", category: "Science fiction", color: "#c78d47" },
  { id: "8", title: "Parable of the Talents", author: "Octavia E. Butler", series: "Earthseed", category: "Science fiction", color: "#6c744b" },
  { id: "9", title: "Piranesi", author: "Susanna Clarke", series: "", category: "Fantasy", color: "#7494a6" },
];

const palette = ["#a64b45", "#cd725c", "#edb458", "#568f78", "#657994", "#7d5a68"];

function bookSort(a: Book, b: Book) {
  return [a.category, a.author, a.series || a.title, a.title].join("|")
    .localeCompare([b.category, b.author, b.series || b.title, b.title].join("|"));
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>(starterBooks);
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [frontFile, setFrontFile] = useState<File>();
  const [backFile, setBackFile] = useState<File>();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [category, setCategory] = useState("Science fiction");
  const [isbn, setIsbn] = useState("");
  const [isbn10, setIsbn10] = useState("");
  const [isbn13, setIsbn13] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [language, setLanguage] = useState("");
  const [metadataSource, setMetadataSource] = useState("");
  const [recognitionMethod, setRecognitionMethod] = useState("");
  const [recognitionConfidence, setRecognitionConfidence] = useState(0);
  const [scanPhase, setScanPhase] = useState("");
  const [scanError, setScanError] = useState("");
  const [status, setStatus] = useState<"idle" | "review" | "placed">("idle");
  const [placedBook, setPlacedBook] = useState<Book>();
  const nextScanId = useRef(0);
  const latestScanId = useRef(0);
  const bestRecognition = useRef<ScanCandidate | undefined>(undefined);

  useEffect(() => {
    fetch("/api/books")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((saved: Book[]) => { if (saved.length) setBooks(saved); })
      .catch(() => { /* The sample shelf remains available in local preview. */ });
  }, []);

  const ordered = useMemo(() => [...books].sort(bookSort), [books]);
  const proposed: Book = useMemo(() => ({
    id: "preview",
    title: title || "New book",
    subtitle,
    author: author || "Unknown author",
    series,
    category,
    color: palette[(title.length + author.length) % palette.length],
    cover: front,
    isbn,
    isbn10,
    isbn13,
    publisher,
    publishedDate,
    description,
    pageCount,
    language,
    metadataSource,
    recognitionMethod,
    recognitionConfidence,
  }), [title, subtitle, author, series, category, front, isbn, isbn10, isbn13, publisher, publishedDate, description, pageCount, language, metadataSource, recognitionMethod, recognitionConfidence]);

  const position = useMemo(() => {
    const all = [...ordered, proposed].sort(bookSort);
    const index = all.findIndex((book) => book.id === "preview");
    return {
      index,
      before: index > 0 ? all[index - 1] : undefined,
      after: index < all.length - 1 ? all[index + 1] : undefined,
    };
  }, [ordered, proposed]);

  function applyRecognized(book: RecognizedBook) {
    setTitle(book.title || "");
    setSubtitle(book.subtitle || "");
    setAuthor(book.author || "");
    setCategory(book.category || "Literary fiction");
    setIsbn(book.isbn || book.isbn13 || book.isbn10 || "");
    setIsbn10(book.isbn10 || "");
    setIsbn13(book.isbn13 || "");
    setPublisher(book.publisher || "");
    setPublishedDate(book.publishedDate || "");
    setDescription(book.description || "");
    setPageCount(book.pageCount || null);
    setLanguage(book.language || "");
    setMetadataSource(book.metadataSource || "");
    setRecognitionMethod(book.recognitionMethod || "");
    setRecognitionConfidence(book.recognitionConfidence || 0);
  }

  function updateScanPhase(scanId: number, message: string) {
    if (scanId === latestScanId.current) setScanPhase(message);
  }

  function candidatePriority(method?: string) {
    if (method === "barcode") return 3;
    if (method === "printed-isbn") return 2;
    return 1;
  }

  function acceptCandidate(book: RecognizedBook, scanId: number) {
    const candidate = { book, scanId, priority: candidatePriority(book.recognitionMethod) };
    const current = bestRecognition.current;
    if (current && (candidate.priority < current.priority ||
      (candidate.priority === current.priority && candidate.scanId < current.scanId))) return false;
    bestRecognition.current = candidate;
    applyRecognized(book);
    setScanError("");
    return true;
  }

  async function queryBook(payload: { isbn?: string; text?: string; method: string }, scanId: number) {
    updateScanPhase(scanId, "Checking Google Books and Open Library…");
    const response = await fetch("/api/books/recognize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as { book?: RecognizedBook; error?: string };
    if (!response.ok || !result.book) throw new Error(result.error || "No matching book was found.");
    acceptCandidate(result.book, scanId);
    if (scanId === latestScanId.current) {
      setScanPhase("");
    }
  }

  function isbnFromText(value: string) {
    const labeled = value.match(/ISBN(?:-1[03])?[\s:]*([0-9Xx][0-9Xx\-\s]{8,20})/i)?.[1];
    const candidates = [labeled, ...value.match(/\b(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx]\b/g) || []].filter(Boolean) as string[];
    return candidates.map((candidate) => candidate.replace(/[^0-9X]/gi, "")).find((candidate) => candidate.length === 10 || candidate.length === 13);
  }

  async function recognizePhoto(file: File, preview: string, scanId: number) {
    setScanError("");
    updateScanPhase(scanId, "Looking for an ISBN barcode…");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(preview);
      const detected = isbnFromText(result.getText());
      if (detected) {
        await queryBook({ isbn: detected, method: "barcode" }, scanId);
        return;
      }
    } catch {
      // A missing barcode is expected for front covers and older editions.
    }

    try {
      updateScanPhase(scanId, "Reading the cover text…");
      const { recognize } = await import("tesseract.js");
      const result = await recognize(file, "eng", {
        logger: (message) => {
          if (message.status === "recognizing text") updateScanPhase(scanId, `Reading the cover… ${Math.round((message.progress || 0) * 100)}%`);
        },
      });
      const text = result.data.text.trim();
      const printedIsbn = isbnFromText(text);
      await queryBook(printedIsbn
        ? { isbn: printedIsbn, text, method: "printed-isbn" }
        : { text, method: "title-author" }, scanId);
    } catch (error) {
      if (scanId === latestScanId.current) {
        setScanPhase("");
        if (!bestRecognition.current) {
          setScanError(error instanceof Error ? error.message : "I couldn’t identify this edition. Try a clearer cover photo.");
        }
      }
    }
  }

  function choosePhoto(side: "front" | "back") {
    return async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const scanId = ++nextScanId.current;
      latestScanId.current = scanId;
      const preview = URL.createObjectURL(file);
      if (side === "front") { setFront(preview); setFrontFile(file); }
      else { setBack(preview); setBackFile(file); }
      setStatus("review");
      await recognizePhoto(file, preview, scanId);
    };
  }

  async function addBook() {
    if (!title.trim() || !author.trim()) return;
    const book = { ...proposed, id: crypto.randomUUID() };
    setBooks((current) => [...current, book]);
    setPlacedBook(book);
    setStatus("placed");
    const data = new FormData();
    data.set("title", book.title);
    data.set("subtitle", book.subtitle || "");
    data.set("author", book.author);
    data.set("series", book.series);
    data.set("category", book.category);
    data.set("color", book.color);
    data.set("isbn", book.isbn || "");
    data.set("isbn10", book.isbn10 || "");
    data.set("isbn13", book.isbn13 || "");
    data.set("publisher", book.publisher || "");
    data.set("publishedDate", book.publishedDate || "");
    data.set("description", book.description || "");
    data.set("pageCount", String(book.pageCount || ""));
    data.set("language", book.language || "");
    data.set("metadataSource", book.metadataSource || "");
    data.set("recognitionMethod", book.recognitionMethod || "");
    data.set("recognitionConfidence", String(book.recognitionConfidence || 0));
    if (frontFile) data.set("front", frontFile);
    if (backFile) data.set("back", backFile);
    fetch("/api/books", { method: "POST", body: data }).catch(() => {});
  }

  function reset() {
    latestScanId.current = ++nextScanId.current;
    bestRecognition.current = undefined;
    setFront(undefined);
    setBack(undefined);
    setFrontFile(undefined);
    setBackFile(undefined);
    setTitle("");
    setSubtitle("");
    setAuthor("");
    setSeries("");
    setCategory("Science fiction");
    setIsbn("");
    setIsbn10("");
    setIsbn13("");
    setPublisher("");
    setPublishedDate("");
    setDescription("");
    setPageCount(null);
    setLanguage("");
    setMetadataSource("");
    setRecognitionMethod("");
    setRecognitionConfidence(0);
    setScanPhase("");
    setScanError("");
    setStatus("idle");
    setPlacedBook(undefined);
  }

  const hasDraft = Boolean(front || back || title || author || scanPhase);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Librarian home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          Librarian
        </a>
        <nav aria-label="Primary navigation">
          <button className="nav-active">Add a book</button>
          <button onClick={() => document.getElementById("library")?.scrollIntoView({ behavior: "smooth" })}>My library</button>
        </nav>
        <div className="library-count"><span>{books.length}</span> books shelved</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Your personal shelf guide</p>
          <h1>Every book has<br />a <em>right place.</em></h1>
          <p className="lede">Photograph the cover. Librarian reads the clues, learns your collection, and shows you exactly where it belongs.</p>
        </div>
        <div className="hero-quote" aria-hidden="true">
          <span>“</span>
          A library is not a luxury<br />but one of the necessities of life.
          <small>— Henry Ward Beecher</small>
        </div>
      </section>

      <section className="workspace" aria-label="Add a book">
        <div className="capture-panel">
          <div className="section-heading">
            <span>01</span>
            <div><h2>Show me the book</h2><p>Front, back, or both. A clear photo works best.</p></div>
          </div>
          <div className="photo-grid">
            <label className={`photo-drop ${front ? "has-photo" : ""}`}>
              {front ? <img src={front} alt="Front cover preview" /> : <><b>＋</b><strong>Front cover</strong><small>Tap to take or choose a photo</small></>}
              <input type="file" accept="image/*" capture="environment" onChange={choosePhoto("front")} />
            </label>
            <label className={`photo-drop secondary ${back ? "has-photo" : ""}`}>
              {back ? <img src={back} alt="Back cover preview" /> : <><b>＋</b><strong>Back cover</strong><small>Great for ISBN &amp; description</small></>}
              <input type="file" accept="image/*" capture="environment" onChange={choosePhoto("back")} />
            </label>
          </div>
          <p className="privacy-note">Barcode and cover text are read automatically. Photos stay private.</p>
        </div>

        <div className="details-panel">
          <div className="section-heading">
            <span>02</span>
            <div><h2>Check the details</h2><p>Librarian makes a best guess. You stay in control.</p></div>
          </div>
          {!hasDraft ? (
            <div className="waiting">
              <div className="waiting-books" aria-hidden="true"><i /><i /><i /><i /></div>
              <h3>Waiting for a cover</h3>
              <p>Add a photo and the book’s details will appear here for a quick review.</p>
            </div>
          ) : scanPhase && !title ? (
            <div className="scanner-state" role="status" aria-live="polite">
              <span className="scan-ring" aria-hidden="true" />
              <h3>Librarian is reading…</h3>
              <p>{scanPhase}</p>
              <div className="scan-steps"><i className="done" /><i className={scanPhase.includes("Books") ? "done" : ""} /><i /></div>
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); addBook(); }} className="book-form">
              {recognitionConfidence > 0 && (
                <div className="recognition-badge">
                  <span>✓ Identified automatically</span>
                  <strong>{recognitionConfidence}% match</strong>
                </div>
              )}
              {scanError && <p className="scan-error">{scanError}</p>}
              <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" required /></label>
              <label>Subtitle<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Optional" /></label>
              <label>Author<input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" required /></label>
              <div className="form-row">
                <label>ISBN<input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="ISBN-10 or ISBN-13" /></label>
                <label>Section<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Science fiction</option><option>Fantasy</option><option>Literary fiction</option><option>Mystery</option><option>History</option><option>Biography</option><option>Art & design</option></select></label>
              </div>
              <div className="form-row">
                <label>Publisher<input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="Publisher" /></label>
                <label>Published<input value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} placeholder="Publication date" /></label>
              </div>
              <label>Series<input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Optional" /></label>
              {(description || pageCount || language) && (
                <p className="metadata-note">{[pageCount && `${pageCount} pages`, language?.toUpperCase(), publisher].filter(Boolean).join(" · ")}</p>
              )}
              <button className="primary" type="submit">Find its place <span>→</span></button>
            </form>
          )}
        </div>
      </section>

      {status === "placed" && placedBook && (
        <section className="placement" aria-live="polite">
          <p className="eyebrow">Shelf recommendation</p>
          <h2>Place <em>{placedBook.title}</em> here</h2>
          <div className="placement-row">
            <BookCard book={position.before} label="On the left" />
            <div className="new-book"><span>New</span><BookSpine book={placedBook} /></div>
            <BookCard book={position.after} label="On the right" />
          </div>
          <p className="reason">Grouped by <strong>{placedBook.category}</strong>, then author, series, and title — so related books stay together as your library grows.</p>
          <button className="text-button" onClick={reset}>Add another book →</button>
        </section>
      )}

      <section id="library" className="shelf-section">
        <div className="shelf-heading">
          <div><p className="eyebrow">Your living collection</p><h2>A shelf that gets smarter<br />with every book.</h2></div>
          <p>{books.length} books · {new Set(books.map((book) => book.author)).size} authors · {new Set(books.map((book) => book.category)).size} sections</p>
        </div>
        <div className="shelf" aria-label="Your books in recommended order">
          <div className="spines">
            {ordered.map((book) => <BookSpine key={book.id} book={book} />)}
          </div>
          <div className="shelf-board" />
        </div>
      </section>

      <footer><span>Librarian</span><p>Made for the pleasure of finding things again.</p><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button></footer>
    </main>
  );
}

function BookSpine({ book }: { book: Book }) {
  return (
    <div className="book-spine" style={{ background: book.color }} title={`${book.title} — ${book.author}`}>
      <strong>{book.title}</strong><small>{book.author}</small>
    </div>
  );
}

function BookCard({ book, label }: { book?: Book; label: string }) {
  return (
    <div className="neighbor">
      <small>{label}</small>
      {book ? <><BookSpine book={book} /><p><strong>{book.title}</strong><br />{book.author}</p></> : <p className="shelf-end">End of shelf</p>}
    </div>
  );
}
