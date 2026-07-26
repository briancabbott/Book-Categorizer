import storage from "@/lib/storage";

export async function GET(_: Request, context: { params: Promise<{ id: string; side: string }> }) {
  const { id, side } = await context.params;
  if (!/^[a-f0-9-]+$/i.test(id) || !["front", "back"].includes(side)) {
    return new Response("Not found", { status: 404 });
  }
  const object = await storage.getImage(id, side as "front" | "back");
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": object.contentType,
    "cache-control": "public, max-age=31536000, immutable",
  });
  if (object.etag) headers.set("etag", object.etag);
  const body = object.body instanceof Uint8Array ? Uint8Array.from(object.body).buffer : object.body;
  return new Response(body, { headers });
}
