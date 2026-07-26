import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { BookInput, BookRecord, BookStorage, ImageInput, StoredImage } from "./storage-types";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const booksFile = path.join(dataDir, "books.json");

async function localBooks() {
  try {
    return JSON.parse(await readFile(booksFile, "utf8")) as BookRecord[];
  } catch {
    return [];
  }
}

async function writeLocalBooks(books: BookRecord[]) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${booksFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(books, null, 2));
  await rename(temporary, booksFile);
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
      return (await localBooks()).sort((a, b) =>
        [a.category, a.author, a.series || a.title, a.title].join("|")
          .localeCompare([b.category, b.author, b.series || b.title, b.title].join("|")));
    },
    async createBook(input, images) {
      const id = crypto.randomUUID();
      const book: BookRecord = { ...input, id, createdAt: Date.now(), cover: images.front ? `/api/books/image/${id}/front` : undefined };
      const books = await localBooks();
      await Promise.all([
        writeLocalBooks([...books, book]),
        ...(images.front ? [writeLocalImage(id, "front", images.front)] : []),
        ...(images.back ? [writeLocalImage(id, "back", images.back)] : []),
      ]);
      return book;
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
