import { del, put } from "@vercel/blob";

export async function putTempBlob(path: string, data: Buffer, contentType: string): Promise<{ url: string; pathname: string }> {
  const out = await put(path, data, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  return { url: out.url, pathname: out.pathname };
}

export async function deleteTempBlob(url: string): Promise<void> {
  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch {
    // best-effort cleanup
  }
}