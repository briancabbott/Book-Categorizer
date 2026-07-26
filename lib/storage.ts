import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { BookInput, BookRecord, BookStorage, ImageInput, StoredImage } from "./storage-types";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const booksFile = path.join(dataDir, "books.json");
const localSchemaVersion = 2;

type LocalStore = { schemaVersion: number; books: BookRecord[] };

async function writeLocalStore(store: LocalStore) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${booksFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2));
  await rename(temporary, booksFile);
}

async function localStore(): Promise<LocalStore> {
  let source: string;
  try {
    source = await readFile(booksFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: localSchemaVersion, books: [] };
    throw error;
  }
  const parsed = JSON.parse(source) as LocalStore | BookRecord[];
  if (Array.isArray(parsed)) {
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "books.pre-migration-v0.json"), source, { flag: "wx" }).catch(() => {});
    const migrated = { schemaVersion: localSchemaVersion, books: parsed };
    await writeLocalStore(migrated);
    return migrated;
  }
  if ((parsed.schemaVersion || 1) < 2) {
    await writeFile(path.join(dataDir, "books.pre-migration-v1.json"), source, { flag: "wx" }).catch(() => {});
    const migrated = {
      schemaVersion: localSchemaVersion,
      books: (parsed.books || []).map((book) => ({ ...book, externalCoverUrl: book.externalCoverUrl || "" })),
    };
    await writeLocalStore(migrated);
    return migrated;
  }
  return { schemaVersion: parsed.schemaVersion, books: parsed.books || [] };
}

async function writeLocalBooks(books: BookRecord[]) {
  await writeLocalStore({ schemaVersion: localSchemaVersion, books });
}

async function writeLocalImage(id: string, side: string, image: ImageInput) {
  const directory = path.join(dataDir, "images", id);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, `${side}.bin`), image.bytes),
    writeFile(path.join(directory, `${side}.json`), JSON.stringify({ contentType: image.contentType })),
  ]);
}

function localStorage(): BookStorage {
  return {
    async listBooks() {
      return (await localStore()).books.sort((a, b) =>
        [a.category, a.author, a.series || a.title, a.title].join("|")
          .localeCompare([b.category, b.author, b.series || b.title, b.title].join("|")));
    },
    async createBook(input, images) {
      const id = crypto.randomUUID();
      const book: BookRecord = { ...input, id, createdAt: Date.now(), cover: images.front ? `/api/books/image/${id}/front` : undefined };
      const books = (await localStore()).books;
      await Promise.all([
        writeLocalBooks([...books, book]),
        ...(images.front ? [writeLocalImage(id, "front", images.front)] : []),
        ...(images.back ? [writeLocalImage(id, "back", images.back)] : []),
      ]);
      return book;
    },
    async deleteBook(id) {
      const store = await localStore();
      const remaining = store.books.filter((book) => book.id !== id);
      if (remaining.length === store.books.length) return false;
      await writeLocalBooks(remaining);
      await rm(path.join(dataDir, "images", id), { recursive: true, force: true });
      return true;
    },
    async updateExternalCover(id, externalCoverUrl) {
      const store = await localStore();
      const book = store.books.find((entry) => entry.id === id);
      if (!book) return false;
      book.externalCoverUrl = externalCoverUrl;
      await writeLocalBooks(store.books);
      return true;
    },
    async getImage(id, side) {
      try {
        const [body, metadata] = await Promise.all([
          readFile(path.join(dataDir, "images", id, `${side}.bin`)),
          readFile(path.join(dataDir, "images", id, `${side}.json`), "utf8"),
        ]);
        return { body, contentType: (JSON.parse(metadata) as { contentType: string }).contentType } satisfies StoredImage;
      } catch {
        return null;
      }
    },
  };
}

function awsStorage(): BookStorage {
  const tableName = process.env.BOOKS_TABLE;
  const bucketName = process.env.BOOK_IMAGES_BUCKET;
  if (!tableName || !bucketName) throw new Error("AWS storage requires BOOKS_TABLE and BOOK_IMAGES_BUCKET.");
  const document = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = new S3Client({});
  return {
    async listBooks() {
      const response = await document.send(new ScanCommand({ TableName: tableName }));
      return (response.Items || []) as BookRecord[];
    },
    async createBook(input, images) {
      const id = crypto.randomUUID();
      const book: BookRecord = { ...input, id, createdAt: Date.now(), cover: images.front ? `/api/books/image/${id}/front` : undefined };
      await Promise.all([
        document.send(new PutCommand({ TableName: tableName, Item: book })),
        ...(images.front ? [s3.send(new PutObjectCommand({ Bucket: bucketName, Key: `books/${id}/front`, Body: images.front.bytes, ContentType: images.front.contentType }))] : []),
        ...(images.back ? [s3.send(new PutObjectCommand({ Bucket: bucketName, Key: `books/${id}/back`, Body: images.back.bytes, ContentType: images.back.contentType }))] : []),
      ]);
      return book;
    },
    async deleteBook(id) {
      const response = await document.send(new DeleteCommand({
        TableName: tableName,
        Key: { id },
        ReturnValues: "ALL_OLD",
      }));
      await Promise.all([
        s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: `books/${id}/front` })),
        s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: `books/${id}/back` })),
      ]);
      return Boolean(response.Attributes);
    },
    async updateExternalCover(id, externalCoverUrl) {
      const response = await document.send(new UpdateCommand({
        TableName: tableName,
        Key: { id },
        UpdateExpression: "SET externalCoverUrl = :url",
        ExpressionAttributeValues: { ":url": externalCoverUrl },
        ReturnValues: "ALL_NEW",
      }));
      return Boolean(response.Attributes);
    },
    async getImage(id, side) {
      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: `books/${id}/${side}` }));
        if (!object.Body) return null;
        return {
          body: new Uint8Array(await object.Body.transformToByteArray()),
          contentType: object.ContentType || "application/octet-stream",
          etag: object.ETag,
        } satisfies StoredImage;
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },
  };
}

export const storage = process.env.STORAGE_DRIVER === "aws" ? awsStorage() : localStorage();
export default storage;
