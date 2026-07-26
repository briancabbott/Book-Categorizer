import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);

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
