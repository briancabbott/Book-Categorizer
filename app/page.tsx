"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Book = {
  id: string;
  title: string;
  author: string;
  series: string;
  category: string;
  color: string;
  cover?: string;
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

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

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
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [category, setCategory] = useState("Science fiction");
  const [status, setStatus] = useState<"idle" | "review" | "placed">("idle");
  const [placedBook, setPlacedBook] = useState<Book>();

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
    author: author || "Unknown author",
    series,
    category,
    color: palette[(title.length + author.length) % palette.length],
    cover: front,
  }), [title, author, series, category, front]);

  const position = useMemo(() => {
    const all = [...ordered, proposed].sort(bookSort);
    const index = all.findIndex((book) => book.id === "preview");
    return {
      index,
      before: index > 0 ? all[index - 1] : undefined,
      after: index < all.length - 1 ? all[index + 1] : undefined,
    };
  }, [ordered, proposed]);

  function choosePhoto(side: "front" | "back") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const preview = URL.createObjectURL(file);
      if (side === "front") { setFront(preview); setFrontFile(file); }
      else { setBack(preview); setBackFile(file); }
      setStatus("review");
      if (!title) {
        const cleaned = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        if (!/^image|^img|^photo/i.test(cleaned)) setTitle(cleaned);
      }
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
    data.set("author", book.author);
    data.set("series", book.series);
    data.set("category", book.category);
    data.set("color", book.color);
    if (frontFile) data.set("front", frontFile);
    if (backFile) data.set("back", backFile);
    fetch("/api/books", { method: "POST", body: data }).catch(() => {});
  }

  function reset() {
    setFront(undefined);
    setBack(undefined);
    setFrontFile(undefined);
    setBackFile(undefined);
    setTitle("");
    setAuthor("");
    setSeries("");
    setCategory("Science fiction");
    setStatus("idle");
    setPlacedBook(undefined);
  }

  const hasDraft = Boolean(front || back || title || author);

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
          <p className="privacy-note">Photos stay private and are used only to identify your books.</p>
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
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); addBook(); }} className="book-form">
              <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" required /></label>
              <label>Author<input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" required /></label>
              <div className="form-row">
                <label>Series<input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Optional" /></label>
                <label>Section<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Science fiction</option><option>Fantasy</option><option>Literary fiction</option><option>Mystery</option><option>History</option><option>Biography</option><option>Art & design</option></select></label>
              </div>
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
