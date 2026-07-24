import { env } from "cloudflare:workers";

type RuntimeEnv = { BOOK_IMAGES: R2Bucket };

export async function GET(_: Request, context: { params: Promise<{ id: string; side: string }> }) {
  const { id, side } = await context.params;
  if (!/^[a-f0-9-]+$/i.test(id) || !["front", "back"].includes(side)) {
    return new Response("Not found", { status: 404 });
  }
  const object = await (env as unknown as RuntimeEnv).BOOK_IMAGES.get(`books/${id}/${side}`);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
