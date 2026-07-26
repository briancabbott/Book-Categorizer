import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);
const recognitionUrl = new URL("../app/api/books/recognize/route.ts", import.meta.url);
const booksApiUrl = new URL("../app/api/books/route.ts", import.meta.url);

test("provides all four Librarian workspaces", async () => {
  const page = await readFile(pageUrl, "utf8");
  for (const label of ["Add a Book", "My Library", "My Shelves", "My Reading"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /Current learning goals/);
  assert.match(page, /libraryGroups\.map/);
  assert.match(page, /shelfRows\.map/);
});

test("supports a grouped technical catalog and multi-format reading notes", async () => {
  const [page, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  assert.match(page, /discipline-bar/);
  assert.match(page, /subsection-bar/);
  assert.match(page, /SpeechRecognition/);
  assert.match(page, /Photograph a note/);
  assert.match(page, /librarian-reading-goals/);
  assert.match(css, /\.library-table/);
  assert.match(css, /\.shelf-stack/);
  assert.match(css, /\.notes-timeline/);
});

test("classifies a two-image upload and supports manual correction", async () => {
  const [page, css, recognition] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(recognitionUrl, "utf8"),
  ]);
  assert.match(page, /multiple onChange=\{choosePhotos\}/);
  assert.match(page, /isbnIndexes\.length === 1/);
  assert.match(page, /manuallyAssign/);
  assert.match(page, /recognizePhoto\(selectedBack\.file, selectedBack\.preview, scanId, true\)/);
  assert.match(page, /Rechecking the selected back cover for its ISBN/);
  assert.match(page, /Flip front &amp; back/);
  assert.match(page, /The other image will be assigned automatically/);
  assert.match(page, /targetBytes = 380_000/);
  assert.match(page, /normalizePhoto/);
  assert.match(page, /BrowserMultiFormatOneDReader/);
  assert.match(css, /\.side-choices/);
  assert.match(css, /\.assignment-warning/);
  assert.match(recognition, /matched:\s*false/);
  assert.doesNotMatch(recognition, /status:\s*404/);
});

test("deletes library entries and their related data", async () => {
  const [page, api, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(booksApiUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  assert.match(page, /Delete “\$\{book\.title\}” from your library/);
  assert.match(page, /method:\s*"DELETE"/);
  assert.match(page, /bookIds:\s*goal\.bookIds\.filter/);
  assert.match(api, /export async function DELETE/);
  assert.match(api, /storage\.deleteBook/);
  assert.match(css, /\.delete-book/);
});

test("prevents duplicate database entries before storing images", async () => {
  const [page, api] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(booksApiUrl, "utf8"),
  ]);
  assert.match(api, /function canonicalIsbn/);
  assert.match(api, /function isDuplicate/);
  assert.match(api, /storage\.listBooks\(\)\)\.find/);
  assert.ok(api.indexOf("duplicate =") < api.indexOf("storage.createBook"));
  assert.match(api, /duplicate:\s*true/);
  assert.match(page, /result\.duplicate/);
});

test("stores and displays online book cover URLs", async () => {
  const [page, api, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(booksApiUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  assert.match(page, /externalCoverUrl/);
  assert.match(page, /book\.externalCoverUrl \|\| book\.cover/);
  assert.match(api, /externalCoverUrl:\s*text/);
  assert.match(api, /updateExternalCover/);
  assert.match(css, /\.cover-cell/);
});

test("tracks book density and projects learning-goal pace", async () => {
  const [page, api, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(booksApiUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  assert.match(api, /wordCount:\s*Number/);
  assert.match(page, /Word count/);
  assert.match(page, /words\/page/);
  assert.match(page, /function GoalPace/);
  assert.match(page, /Effective daily rate/);
  assert.match(page, /Projected completion/);
  assert.match(page, /Log reading/);
  assert.match(css, /\.pace-card/);
});
