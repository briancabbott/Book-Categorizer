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
  wordCount?: number | null;
  wordCountSource?: string;
  densityWordsPerPage?: number | null;
  densitySampleSize?: number;
  densityConfidence?: number;
  densityAnalyzedAt?: number | null;
  densityMethod?: string;
  language?: string;
  metadataSource?: string;
  recognitionMethod?: string;
  recognitionConfidence?: number;
  externalCoverUrl?: string;
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

type PhotoCandidate = {
  id: string;
  file: File;
  preview: string;
  side?: "front" | "back";
  hasIsbn?: boolean;
};

type ReadingNote = {
  id: string;
  type: "typed" | "spoken" | "image";
  text: string;
  image?: string;
  createdAt: number;
};

type ReadingGoal = {
  id: string;
  title: string;
  description: string;
  bookIds: string[];
  notes: ReadingNote[];
  createdAt: number;
  targetDate: string;
  progress: Array<{ id: string; bookId: string; pagesRead: number; createdAt: number }>;
};

const starterBooks: Book[] = [];

const stemSections = [
  "Computer Science — Algorithms & Theory",
  "Computer Science — AI & Machine Learning",
  "Computer Science — Systems & Architecture",
  "Computer Science — Programming Languages",
  "Computer Science — Software Engineering",
  "Computer Science — Data & Databases",
  "Computer Science — Networks & Security",
  "Computer Science — General",
  "Mathematics — Algebra & Number Theory",
  "Mathematics — Analysis",
  "Mathematics — Geometry & Topology",
  "Mathematics — Probability & Statistics",
  "Mathematics — Applied & Computational",
  "Mathematics — Logic & Foundations",
  "Mathematics — General",
  "Physics — Classical Mechanics",
  "Physics — Quantum Mechanics",
  "Physics — Relativity & Gravitation",
  "Physics — Electromagnetism",
  "Physics — Thermodynamics & Statistical Mechanics",
  "Physics — Condensed Matter",
  "Physics — Optics & Photonics",
  "Physics — Particle & Nuclear Physics",
  "Physics — Astrophysics & Cosmology",
  "Physics — General",
  "STEM — To classify",
];

const palette = ["#a64b45", "#cd725c", "#edb458", "#568f78", "#657994", "#7d5a68"];

function bookSort(a: Book, b: Book) {
  return [a.category, a.author, a.series || a.title, a.title].join("|")
    .localeCompare([b.category, b.author, b.series || b.title, b.title].join("|"));
}

export default function Home() {
  const [view, setView] = useState<"add" | "library" | "shelves" | "reading">("add");
  const [books, setBooks] = useState<Book[]>(starterBooks);
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [frontFile, setFrontFile] = useState<File>();
  const [backFile, setBackFile] = useState<File>();
  const [photoCandidates, setPhotoCandidates] = useState<PhotoCandidate[]>([]);
  const [assignmentStatus, setAssignmentStatus] = useState<"idle" | "scanning" | "automatic" | "manual">("idle");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [category, setCategory] = useState("STEM — To classify");
  const [isbn, setIsbn] = useState("");
  const [isbn10, setIsbn10] = useState("");
  const [isbn13, setIsbn13] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [wordCountSource, setWordCountSource] = useState("");
  const [language, setLanguage] = useState("");
  const [metadataSource, setMetadataSource] = useState("");
  const [recognitionMethod, setRecognitionMethod] = useState("");
  const [recognitionConfidence, setRecognitionConfidence] = useState(0);
  const [externalCoverUrl, setExternalCoverUrl] = useState("");
  const [scanPhase, setScanPhase] = useState("");
  const [scanError, setScanError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string>();
  const [analyzingBookId, setAnalyzingBookId] = useState<string>();
  const [densityProgress, setDensityProgress] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [status, setStatus] = useState<"idle" | "review" | "placed">("idle");
  const [placedBook, setPlacedBook] = useState<Book>();
  const [shelfCapacity, setShelfCapacity] = useState(10);
  const [readingGoals, setReadingGoals] = useState<ReadingGoal[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalBookIds, setGoalBookIds] = useState<string[]>([]);
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [progressDrafts, setProgressDrafts] = useState<Record<string, { bookId: string; pages: string }>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [listeningGoal, setListeningGoal] = useState<string>();
  const nextScanId = useRef(0);
  const latestScanId = useRef(0);
  const bestRecognition = useRef<ScanCandidate | undefined>(undefined);

  useEffect(() => {
    fetch("/api/books")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((saved: Book[]) => { if (saved.length) setBooks(saved); })
      .catch(() => { /* The sample shelf remains available in local preview. */ });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("librarian-reading-goals");
      if (saved) setReadingGoals((JSON.parse(saved) as ReadingGoal[]).map((goal) => ({
        ...goal,
        createdAt: goal.createdAt || Date.now(),
        targetDate: goal.targetDate || "",
        progress: goal.progress || [],
      })));
    } catch {
      // A damaged browser entry should not prevent the library from loading.
    }
    const resize = () => setShelfCapacity(Math.max(3, Math.floor((window.innerWidth * .88 - 36) / 77)));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("librarian-reading-goals", JSON.stringify(readingGoals));
    } catch {
      // Large photographed notes may exceed browser storage; the rest of the journal remains usable.
    }
  }, [readingGoals]);

  const ordered = useMemo(() => [...books].sort(bookSort), [books]);
  const shelfRows = useMemo(() => {
    const rows: Book[][] = [];
    for (let index = 0; index < ordered.length; index += shelfCapacity) rows.push(ordered.slice(index, index + shelfCapacity));
    return rows;
  }, [ordered, shelfCapacity]);
  const libraryGroups = useMemo(() => {
    const groups = new Map<string, Book[]>();
    ordered.forEach((book) => groups.set(book.category, [...(groups.get(book.category) || []), book]));
    return [...groups.entries()];
  }, [ordered]);
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
    wordCount,
    wordCountSource,
    language,
    metadataSource,
    recognitionMethod,
    recognitionConfidence,
    externalCoverUrl,
  }), [title, subtitle, author, series, category, front, isbn, isbn10, isbn13, publisher, publishedDate, description, pageCount, wordCount, wordCountSource, language, metadataSource, recognitionMethod, recognitionConfidence, externalCoverUrl]);

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
    setCategory(book.category || "STEM — To classify");
    setIsbn(book.isbn || book.isbn13 || book.isbn10 || "");
    setIsbn10(book.isbn10 || "");
    setIsbn13(book.isbn13 || "");
    setPublisher(book.publisher || "");
    setPublishedDate(book.publishedDate || "");
    setDescription(book.description || "");
    setPageCount(book.pageCount || null);
    setWordCount(book.wordCount || (book.pageCount ? book.pageCount * 450 : null));
    setWordCountSource(book.wordCountSource || (book.pageCount ? "estimated" : ""));
    setLanguage(book.language || "");
    setMetadataSource(book.metadataSource || "");
    setRecognitionMethod(book.recognitionMethod || "");
    setRecognitionConfidence(book.recognitionConfidence || 0);
    setExternalCoverUrl(book.coverUrl || "");
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

  async function normalizePhoto(file: File) {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1800;
    const initialScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    let quality = .82;
    let blob: Blob | null = null;
    const targetBytes = 380_000;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("This browser could not prepare the images.");
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= targetBytes) break;
      quality = Math.max(.55, quality - .08);
      if (attempt >= 3) {
        width = Math.max(900, Math.round(width * .86));
        height = Math.max(900, Math.round(height * .86));
      }
    }
    bitmap.close();
    if (!blob) throw new Error("This browser could not prepare the images.");
    const stem = file.name.replace(/\.[^.]+$/, "") || "book-cover";
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  }

  async function recognizePhoto(file: File, preview: string, scanId: number, isbnOnly = false) {
    let isbnDetected = false;
    setScanError("");
    updateScanPhase(scanId, "Looking for an ISBN barcode…");
    try {
      const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatOneDReader().decodeFromImageUrl(preview);
      const detected = isbnFromText(result.getText());
      if (detected) {
        isbnDetected = true;
        await queryBook({ isbn: detected, method: "barcode" }, scanId);
        return true;
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
      isbnDetected = Boolean(printedIsbn);
      if (isbnOnly && !printedIsbn) {
        updateScanPhase(scanId, "");
        return false;
      }
      await queryBook(printedIsbn
        ? { isbn: printedIsbn, text, method: "printed-isbn" }
        : { text, method: "title-author" }, scanId);
      return isbnDetected;
    } catch (error) {
      if (scanId === latestScanId.current) {
        setScanPhase("");
        if (!bestRecognition.current) {
          setScanError(error instanceof Error ? error.message : "I couldn’t identify this edition. Try a clearer cover photo.");
        }
      }
      return isbnDetected;
    }
  }

  function applyPhotoAssignments(candidates: PhotoCandidate[], backIndex: number, source: "automatic" | "manual") {
    const assigned = candidates.map((candidate, index) => ({ ...candidate, side: index === backIndex ? "back" as const : "front" as const }));
    const frontCandidate = assigned.find((candidate) => candidate.side === "front")!;
    const backCandidate = assigned.find((candidate) => candidate.side === "back")!;
    setPhotoCandidates(assigned);
    setFront(frontCandidate.preview);
    setFrontFile(frontCandidate.file);
    setBack(backCandidate.preview);
    setBackFile(backCandidate.file);
    setAssignmentStatus(source);
  }

  async function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];
    if (files.length !== 2) {
      setScanError("Please choose exactly two images. Librarian needs both sides of the book.");
      event.target.value = "";
      return;
    }
    bestRecognition.current = undefined;
    setTitle("");
    setSubtitle("");
    setAuthor("");
    setSeries("");
    setCategory("STEM — To classify");
    setIsbn("");
    setIsbn10("");
    setIsbn13("");
    setPublisher("");
    setPublishedDate("");
    setDescription("");
    setPageCount(null);
    setWordCount(null);
    setWordCountSource("");
    setLanguage("");
    setMetadataSource("");
    setRecognitionMethod("");
    setRecognitionConfidence(0);
    setExternalCoverUrl("");
    setAssignmentStatus("scanning");
    setStatus("review");
    setScanError("");
    setScanPhase("Preparing both images for reading and storage…");
    let preparedFiles: File[];
    try {
      preparedFiles = await Promise.all(files.map(normalizePhoto));
    } catch (error) {
      setAssignmentStatus("idle");
      setScanPhase("");
      setScanError(error instanceof Error ? error.message : "The images could not be prepared.");
      return;
    }
    const candidates = preparedFiles.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setPhotoCandidates(candidates);
    setFront(undefined);
    setBack(undefined);
    setFrontFile(undefined);
    setBackFile(undefined);
    const scanIds = candidates.map(() => ++nextScanId.current);
    latestScanId.current = scanIds[scanIds.length - 1];
    const isbnResults = await Promise.all(candidates.map((candidate, index) =>
      recognizePhoto(candidate.file, candidate.preview, scanIds[index])));
    const inspected = candidates.map((candidate, index) => ({ ...candidate, hasIsbn: isbnResults[index] }));
    const isbnIndexes = inspected.flatMap((candidate, index) => candidate.hasIsbn ? [index] : []);
    if (isbnIndexes.length === 1) {
      applyPhotoAssignments(inspected, isbnIndexes[0], "automatic");
    } else {
      setPhotoCandidates(inspected);
      setAssignmentStatus("manual");
      setScanPhase("");
    }
  }

  async function manuallyAssign(candidateIndex: number, side: "front" | "back") {
    const backIndex = side === "back" ? candidateIndex : candidateIndex === 0 ? 1 : 0;
    applyPhotoAssignments(photoCandidates, backIndex, "manual");
    const selectedBack = photoCandidates[backIndex];
    const scanId = ++nextScanId.current;
    latestScanId.current = scanId;
    setScanError("");
    setScanPhase("Rechecking the selected back cover for its ISBN…");
    const foundIsbn = await recognizePhoto(selectedBack.file, selectedBack.preview, scanId, true);
    if (!foundIsbn) {
      setScanPhase("");
      setScanError("The selected back cover is set, but Librarian still could not read an ISBN. You can review or enter the details manually.");
    }
  }

  function flipPhotos() {
    const backIndex = photoCandidates.findIndex((candidate) => candidate.side === "front");
    if (backIndex >= 0) applyPhotoAssignments(photoCandidates, backIndex, "manual");
  }

  async function addBook() {
    if (!title.trim() || !author.trim()) return;
    const book = { ...proposed, id: crypto.randomUUID() };
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
    data.set("wordCount", String(book.wordCount || ""));
    data.set("wordCountSource", book.wordCountSource || "");
    data.set("language", book.language || "");
    data.set("metadataSource", book.metadataSource || "");
    data.set("recognitionMethod", book.recognitionMethod || "");
    data.set("recognitionConfidence", String(book.recognitionConfidence || 0));
    data.set("externalCoverUrl", book.externalCoverUrl || "");
    if (frontFile) data.set("front", frontFile);
    if (backFile) data.set("back", backFile);
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/books", { method: "POST", body: data });
      const result = await response.json() as Book & { error?: string; detail?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(result.detail || result.error || "The book could not be saved.");
      if (result.duplicate) throw new Error(result.error || "This book is already in your library.");
      setBooks((current) => [...current, result]);
      setPlacedBook(result);
      setStatus("placed");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The book could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    latestScanId.current = ++nextScanId.current;
    bestRecognition.current = undefined;
    setFront(undefined);
    setBack(undefined);
    setFrontFile(undefined);
    setBackFile(undefined);
    setPhotoCandidates([]);
    setAssignmentStatus("idle");
    setTitle("");
    setSubtitle("");
    setAuthor("");
    setSeries("");
    setCategory("STEM — To classify");
    setIsbn("");
    setIsbn10("");
    setIsbn13("");
    setPublisher("");
    setPublishedDate("");
    setDescription("");
    setPageCount(null);
    setWordCount(null);
    setWordCountSource("");
    setLanguage("");
    setMetadataSource("");
    setRecognitionMethod("");
    setRecognitionConfidence(0);
    setExternalCoverUrl("");
    setScanPhase("");
    setScanError("");
    setSaveError("");
    setStatus("idle");
    setPlacedBook(undefined);
  }

  function createReadingGoal() {
    if (!goalTitle.trim()) return;
    setReadingGoals((current) => [...current, {
      id: crypto.randomUUID(),
      title: goalTitle.trim(),
      description: goalDescription.trim(),
      bookIds: goalBookIds,
      notes: [],
      createdAt: Date.now(),
      targetDate: goalTargetDate,
      progress: [],
    }]);
    setGoalTitle("");
    setGoalDescription("");
    setGoalBookIds([]);
    setGoalTargetDate("");
  }

  function addNote(goalId: string, type: ReadingNote["type"], text: string, image?: string) {
    if (!text.trim() && !image) return;
    setReadingGoals((current) => current.map((goal) => goal.id === goalId ? {
      ...goal,
      notes: [...goal.notes, { id: crypto.randomUUID(), type, text: text.trim(), image, createdAt: Date.now() }],
    } : goal));
    setNoteDrafts((current) => ({ ...current, [goalId]: "" }));
  }

  function dictateNote(goalId: string) {
    type Recognition = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start(): void;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    const RecognitionConstructor = (window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!RecognitionConstructor) {
      setNoteDrafts((current) => ({ ...current, [goalId]: "Speech recognition is not available in this browser." }));
      return;
    }
    const recognition = new RecognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    setListeningGoal(goalId);
    recognition.onresult = (event) => addNote(goalId, "spoken", event.results[0][0].transcript);
    recognition.onend = () => setListeningGoal(undefined);
    recognition.onerror = () => setListeningGoal(undefined);
    recognition.start();
  }

  function addImageNote(goalId: string, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => addNote(goalId, "image", file.name, String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function logReadingProgress(goalId: string) {
    const draft = progressDrafts[goalId];
    const pages = Number(draft?.pages || 0);
    if (!draft?.bookId || pages <= 0) return;
    setReadingGoals((current) => current.map((goal) => goal.id === goalId ? {
      ...goal,
      progress: [...goal.progress, { id: crypto.randomUUID(), bookId: draft.bookId, pagesRead: pages, createdAt: Date.now() }],
    } : goal));
    setProgressDrafts((current) => ({ ...current, [goalId]: { bookId: draft.bookId, pages: "" } }));
  }

  async function deleteBook(book: Book) {
    if (!window.confirm(`Delete “${book.title}” from your library? This also removes its stored cover images.`)) return;
    setDeletingBookId(book.id);
    setLibraryError("");
    try {
      const response = await fetch(`/api/books?id=${encodeURIComponent(book.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string; detail?: string };
      if (!response.ok) throw new Error(result.detail || result.error || "The book could not be deleted.");
      setBooks((current) => current.filter((entry) => entry.id !== book.id));
      setReadingGoals((current) => current.map((goal) => ({
        ...goal,
        bookIds: goal.bookIds.filter((id) => id !== book.id),
      })));
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "The book could not be deleted.");
    } finally {
      setDeletingBookId(undefined);
    }
  }

  async function analyzeDensity(book: Book, files: FileList | null) {
    const samples = Array.from(files || []);
    if (!samples.length) return;
    if (!book.pageCount) {
      setLibraryError(`Add a page count for “${book.title}” before analyzing its density.`);
      return;
    }
    setAnalyzingBookId(book.id);
    setLibraryError("");
    try {
      const { recognize } = await import("tesseract.js");
      const wordCounts: number[] = [];
      for (let index = 0; index < samples.length; index += 1) {
        setDensityProgress(`Reading sample ${index + 1} of ${samples.length}…`);
        const result = await recognize(samples[index], "eng");
        const count = result.data.text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’.-]*\b/gu)?.length || 0;
        if (count >= 20) wordCounts.push(count);
      }
      if (!wordCounts.length) throw new Error("No sample contained enough readable text. Try clearer, tightly framed interior pages.");
      const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
      };
      const densityWordsPerPage = median(wordCounts);
      const deviation = median(wordCounts.map((count) => Math.abs(count - densityWordsPerPage)));
      const relativeDeviation = densityWordsPerPage ? deviation / densityWordsPerPage : 1;
      const densityConfidence = Math.max(35, Math.min(95,
        Math.round(45 + Math.min(wordCounts.length, 8) * 6 - Math.min(30, relativeDeviation * 50))));
      const densityMetrics = {
        wordCount: Math.round(densityWordsPerPage * book.pageCount),
        wordCountSource: "sampled",
        densityWordsPerPage,
        densitySampleSize: wordCounts.length,
        densityConfidence,
        densityAnalyzedAt: Date.now(),
        densityMethod: "transient-ocr-median-v1",
      };
      setDensityProgress("Saving aggregate density metrics…");
      const response = await fetch("/api/books", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: book.id, densityMetrics }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Density metrics could not be saved.");
      setBooks((current) => current.map((entry) => entry.id === book.id ? { ...entry, ...densityMetrics } : entry));
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Density analysis failed.");
    } finally {
      setAnalyzingBookId(undefined);
      setDensityProgress("");
    }
  }

  const hasDraft = Boolean(photoCandidates.length || title || author || scanPhase);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Librarian home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          Librarian
        </a>
        <nav aria-label="Primary navigation">
          <button className={view === "add" ? "nav-active" : ""} onClick={() => setView("add")}>Add a Book</button>
          <button className={view === "library" ? "nav-active" : ""} onClick={() => setView("library")}>My Library</button>
          <button className={view === "shelves" ? "nav-active" : ""} onClick={() => setView("shelves")}>My Shelves</button>
          <button className={view === "reading" ? "nav-active" : ""} onClick={() => setView("reading")}>My Reading</button>
        </nav>
        <div className="library-count"><span>{books.length}</span> books shelved</div>
      </header>

      {view === "add" && <>
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
            <div><h2>Show me the book</h2><p>Choose exactly two images. Librarian will determine which side is which.</p></div>
          </div>
          {!photoCandidates.length ? (
            <label className="photo-drop paired-upload">
              <b>＋</b><strong>Select two book images</strong><small>Choose the front and back together, in either order</small>
              <input type="file" accept="image/*" multiple onChange={choosePhotos} />
            </label>
          ) : (
            <>
              <div className="photo-grid">
                {photoCandidates.map((candidate, index) => <div className="photo-candidate" key={candidate.id}>
                  <div className="candidate-image"><img src={candidate.preview} alt={`Uploaded book image ${index + 1}`} />
                    {candidate.side && <span className={`side-label ${candidate.side}`}>{candidate.side}</span>}</div>
                  {assignmentStatus === "manual" && !candidate.side && <div className="side-choices" aria-label={`Choose side for image ${index + 1}`}>
                    <button onClick={() => manuallyAssign(index, "front")}>Front</button>
                    <button onClick={() => manuallyAssign(index, "back")}>Back</button>
                  </div>}
                </div>)}
              </div>
              {assignmentStatus === "scanning" && <p className="assignment-note">Inspecting both images for an ISBN…</p>}
              {assignmentStatus === "manual" && !front && <div className="assignment-warning"><strong>I couldn’t determine the sides confidently.</strong>
                <span>Select Front or Back beneath either image. The other image will be assigned automatically.</span></div>}
              {(assignmentStatus === "automatic" || (assignmentStatus === "manual" && front)) && <div className="assignment-result">
                <span>{assignmentStatus === "automatic" ? "✓ Assigned from ISBN evidence" : "✓ Sides selected"}</span>
                <button type="button" onClick={flipPhotos}>⇄ Flip front &amp; back</button>
              </div>}
              <label className="replace-photos">Choose two different images<input type="file" accept="image/*" multiple onChange={choosePhotos} /></label>
            </>
          )}
          <p className="privacy-note">The image containing the ISBN becomes the back cover. Photos stay private.</p>
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
              {saveError && <p className="scan-error">{saveError}</p>}
              <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" required /></label>
              <label>Subtitle<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Optional" /></label>
              <label>Author<input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" required /></label>
              <div className="form-row">
                <label>ISBN<input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="ISBN-10 or ISBN-13" /></label>
                <label>Section<select value={category} onChange={(e) => setCategory(e.target.value)}>{stemSections.map((section) => <option key={section}>{section}</option>)}</select></label>
              </div>
              <div className="form-row">
                <label>Publisher<input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="Publisher" /></label>
                <label>Published<input value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} placeholder="Publication date" /></label>
              </div>
              <div className="form-row">
                <label>Page count<input type="number" min="1" value={pageCount || ""} onChange={(e) => {
                  const pages = Number(e.target.value) || null;
                  setPageCount(pages);
                  if (pages && wordCountSource !== "manual") { setWordCount(pages * 450); setWordCountSource("estimated"); }
                }} placeholder="Pages" /></label>
                <label>Word count<input type="number" min="1" value={wordCount || ""} onChange={(e) => {
                  setWordCount(Number(e.target.value) || null); setWordCountSource(e.target.value ? "manual" : "");
                }} placeholder="Estimated if unavailable" /></label>
              </div>
              <label>Series<input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Optional" /></label>
              {pageCount && wordCount && <p className="metadata-note">{wordCount.toLocaleString()} words · {Math.round(wordCount / pageCount)} words/page · {wordCountSource}</p>}
              {(description || pageCount || language) && (
                <p className="metadata-note">{[pageCount && `${pageCount} pages`, language?.toUpperCase(), publisher].filter(Boolean).join(" · ")}</p>
              )}
              <button className="primary" type="submit" disabled={saving || !front || !back}>{saving ? "Saving to your library…" : "Find its place"} <span>→</span></button>
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
      </>}

      {view === "library" && (
        <section className="library-view">
          <ViewHeading eyebrow="Catalog" title="My Library" detail={`${books.length} books · ${libraryGroups.length} technical sections`} />
          {libraryError && <p className="library-error">{libraryError}</p>}
          {!books.length ? <EmptyCollection onAdd={() => setView("add")} /> : (
            <div className="library-table" role="table" aria-label="Technical library catalog">
              <div className="library-columns" role="row">
                <strong role="columnheader">Cover</strong><strong role="columnheader">Title</strong><strong role="columnheader">Authors</strong>
                <strong role="columnheader">Published</strong><strong role="columnheader">ISBN</strong><strong role="columnheader">Density</strong>
                <strong role="columnheader">Actions</strong>
              </div>
              {libraryGroups.map(([section, sectionBooks], index) => {
                const [discipline, subsection = "General"] = section.split(" — ");
                return <div className="catalog-group" key={section}>
                  {(index === 0 || libraryGroups[index - 1][0].split(" — ")[0] !== discipline) &&
                    <div className="discipline-bar">{discipline}</div>}
                  <div className="subsection-bar"><span>{subsection}</span><small>{sectionBooks.length} {sectionBooks.length === 1 ? "book" : "books"}</small></div>
                  {sectionBooks.map((book) => <div className="library-row" role="row" key={book.id}>
                    <span role="cell" className="cover-cell">{(book.externalCoverUrl || book.cover) ?
                      <img src={book.externalCoverUrl || book.cover} alt={`Cover of ${book.title}`} /> : <i aria-hidden="true" />}</span>
                    <span role="cell"><strong>{book.title}</strong>{book.subtitle && <small>{book.subtitle}</small>}</span>
                    <span role="cell">{book.author}</span><span role="cell">{book.publishedDate || "—"}</span>
                    <span role="cell">{book.isbn13 || book.isbn10 || book.isbn || "—"}</span>
                    <span role="cell" className="density-summary">{book.densityWordsPerPage ?
                      <><strong>{Math.round(book.densityWordsPerPage)} words/page</strong>
                        <small>{book.densitySampleSize} samples · {book.densityConfidence}% confidence</small></> :
                      <small>Not analyzed</small>}</span>
                    <span role="cell" className="library-actions">
                      <label className={`density-upload ${analyzingBookId === book.id ? "disabled" : ""}`}>
                        {analyzingBookId === book.id ? densityProgress || "Analyzing…" : "Analyze density"}
                        <input type="file" accept="image/*" multiple disabled={Boolean(analyzingBookId)}
                          onChange={(event) => {
                            void analyzeDensity(book, event.target.files);
                            event.target.value = "";
                          }} />
                      </label>
                      <button className="delete-book" type="button" disabled={deletingBookId === book.id} onClick={() => deleteBook(book)}>
                      {deletingBookId === book.id ? "Deleting…" : "Delete"}</button></span>
                  </div>)}
                </div>;
              })}
            </div>
          )}
        </section>
      )}

      {view === "shelves" && (
        <section className="shelves-view">
          <ViewHeading eyebrow="Physical order" title="My Shelves" detail="Read left to right, then continue on the shelf below." />
          {!books.length ? <EmptyCollection onAdd={() => setView("add")} /> : (
            <div className="shelf-stack" aria-label="Books in recommended shelf order">
              {shelfRows.map((row, rowIndex) => <div className="shelf-run" key={rowIndex}>
                <div className="shelf-number">Shelf {rowIndex + 1}</div>
                <div className="spines">{row.map((book) => <BookSpine key={book.id} book={book} />)}</div>
                <div className="shelf-board" />
              </div>)}
            </div>
          )}
        </section>
      )}

      {view === "reading" && (
        <section className="reading-view">
          <ViewHeading eyebrow="Reading journal" title="Current learning goals" detail="Connect books to what you are learning, then capture evidence and ideas as you go." />
          <div className="goal-creator">
            <div><label>Learning goal<input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="e.g. Master randomized algorithms" /></label>
              <label>What does success look like?<textarea value={goalDescription} onChange={(event) => setGoalDescription(event.target.value)} placeholder="Describe the concepts, problems, or outcome you are working toward." /></label></div>
              <label>Target completion date<input type="date" value={goalTargetDate} onChange={(event) => setGoalTargetDate(event.target.value)} /></label>
            <fieldset><legend>Books for this goal</legend>
              {!ordered.length ? <p>Add books to your library first.</p> : ordered.map((book) =>
                <label className="book-check" key={book.id}><input type="checkbox" checked={goalBookIds.includes(book.id)}
                  onChange={() => setGoalBookIds((current) => current.includes(book.id) ? current.filter((id) => id !== book.id) : [...current, book.id])} />
                  <span><strong>{book.title}</strong><small>{book.author}</small></span></label>)}
            </fieldset>
            <button className="primary" onClick={createReadingGoal} disabled={!goalTitle.trim()}>Create learning goal <span>→</span></button>
          </div>
          <div className="goal-list">
            {readingGoals.map((goal) => <article className="goal-card" key={goal.id}>
              <header><div><p className="eyebrow">Active goal</p><h2>{goal.title}</h2><p>{goal.description}</p></div><span>{goal.notes.length} notes</span></header>
              <div className="goal-books">{goal.bookIds.map((id) => books.find((book) => book.id === id)).filter(Boolean).map((book) =>
                <div key={book!.id} style={{ borderColor: book!.color }}><strong>{book!.title}</strong><small>{book!.author}</small></div>)}</div>
              <GoalPace goal={goal} books={books} />
              <div className="progress-composer">
                <select value={progressDrafts[goal.id]?.bookId || ""} onChange={(event) => setProgressDrafts((current) => ({
                  ...current, [goal.id]: { bookId: event.target.value, pages: current[goal.id]?.pages || "" },
                }))}><option value="">Choose a book</option>{goal.bookIds.map((id) => books.find((book) => book.id === id)).filter(Boolean).map((book) =>
                  <option key={book!.id} value={book!.id}>{book!.title}</option>)}</select>
                <input type="number" min="1" placeholder="Pages completed" value={progressDrafts[goal.id]?.pages || ""} onChange={(event) => setProgressDrafts((current) => ({
                  ...current, [goal.id]: { bookId: current[goal.id]?.bookId || "", pages: event.target.value },
                }))} />
                <button onClick={() => logReadingProgress(goal.id)}>Log reading</button>
              </div>
              <div className="note-composer">
                <textarea value={noteDrafts[goal.id] || ""} onChange={(event) => setNoteDrafts((current) => ({ ...current, [goal.id]: event.target.value }))}
                  placeholder="Write a note, proof sketch, question, quotation, or connection…" />
                <div><button onClick={() => addNote(goal.id, "typed", noteDrafts[goal.id] || "")}>Save typed note</button>
                  <button onClick={() => dictateNote(goal.id)}>{listeningGoal === goal.id ? "Listening…" : "🎙 Speak a note"}</button>
                  <label className="image-note">▣ Photograph a note<input type="file" accept="image/*" capture="environment" onChange={(event) => addImageNote(goal.id, event.target.files?.[0])} /></label></div>
              </div>
              <div className="notes-timeline">{[...goal.notes].reverse().map((note) => <div className={`journal-note ${note.type}`} key={note.id}>
                <small>{note.type} · {new Date(note.createdAt).toLocaleString()}</small>
                {note.image && <img src={note.image} alt={note.text || "Photographed reading note"} />}
                {note.text && <p>{note.text}</p>}
              </div>)}</div>
            </article>)}
          </div>
        </section>
      )}

      <footer><span>Librarian</span><p>Made for the pleasure of finding things again.</p><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button></footer>
    </main>
  );
}

function GoalPace({ goal, books }: { goal: ReadingGoal; books: Book[] }) {
  const selected = goal.bookIds.map((id) => books.find((book) => book.id === id)).filter(Boolean) as Book[];
  const totalWords = selected.reduce((sum, book) => sum + (book.wordCount || (book.pageCount || 0) * 450), 0);
  const progressWords = goal.progress.reduce((sum, entry) => {
    const book = books.find((item) => item.id === entry.bookId);
    const density = book?.wordCount && book.pageCount ? book.wordCount / book.pageCount : 450;
    return sum + entry.pagesRead * density;
  }, 0);
  const remainingWords = Math.max(0, totalWords - progressWords);
  const elapsedDays = Math.max(1, (Date.now() - goal.createdAt) / 86_400_000);
  const dailyRate = progressWords / elapsedDays;
  const targetTime = goal.targetDate ? new Date(`${goal.targetDate}T23:59:59`).getTime() : 0;
  const daysToTarget = targetTime ? Math.max(.01, (targetTime - Date.now()) / 86_400_000) : 0;
  const requiredRate = daysToTarget ? remainingWords / daysToTarget : 0;
  const projected = dailyRate > 0 ? new Date(Date.now() + remainingWords / dailyRate * 86_400_000) : undefined;
  const onTarget = Boolean(targetTime && dailyRate > 0 && dailyRate >= requiredRate);
  return <div className={`pace-card ${onTarget ? "on-target" : ""}`}>
    <div><small>Book-set knowledge</small><strong>{Math.round(progressWords).toLocaleString()} / {Math.round(totalWords).toLocaleString()} words</strong></div>
    <div><small>Effective daily rate</small><strong>{dailyRate ? `${Math.round(dailyRate).toLocaleString()} words/day` : "Log reading to establish"}</strong></div>
    <div><small>Objective status</small><strong>{!targetTime ? "Set a target date" : !dailyRate ? "Rate not established" : onTarget ? "On target" : `${Math.round(requiredRate - dailyRate).toLocaleString()} words/day behind`}</strong></div>
    <div><small>Projected completion</small><strong>{projected ? projected.toLocaleDateString() : "Pending reading data"}</strong></div>
  </div>;
}

function ViewHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="view-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><p>{detail}</p></div>;
}

function EmptyCollection({ onAdd }: { onAdd(): void }) {
  return <div className="empty-collection"><div className="waiting-books" aria-hidden="true"><i /><i /><i /><i /></div>
    <h2>Your technical library starts here.</h2><p>Add the first book, and Librarian will begin building its structure.</p>
    <button className="primary" onClick={onAdd}>Add a Book <span>→</span></button></div>;
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
