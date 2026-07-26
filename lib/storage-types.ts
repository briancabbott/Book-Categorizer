export type BookRecord = {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  series: string;
  category: string;
  color: string;
  isbn: string;
  isbn10: string;
  isbn13: string;
  publisher: string;
  publishedDate: string;
  description: string;
  pageCount: number | null;
  wordCount: number | null;
  wordCountSource: string;
  language: string;
  metadataSource: string;
  recognitionMethod: string;
  recognitionConfidence: number;
  externalCoverUrl: string;
  cover?: string;
  createdAt: number;
};

export type BookInput = Omit<BookRecord, "id" | "cover" | "createdAt">;

export type ImageInput = {
  bytes: Uint8Array;
  contentType: string;
};

export type StoredImage = {
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
  etag?: string;
};

export interface BookStorage {
  listBooks(): Promise<BookRecord[]>;
  createBook(input: BookInput, images: { front?: ImageInput; back?: ImageInput }): Promise<BookRecord>;
  updateExternalCover(id: string, externalCoverUrl: string): Promise<boolean>;
  deleteBook(id: string): Promise<boolean>;
  getImage(id: string, side: "front" | "back"): Promise<StoredImage | null>;
}
