import { createHmac, timingSafeEqual } from "crypto";
import { del, put } from "@vercel/blob";

export async function putTempBlob(path: string, data: Buffer, contentType: string): Promise<{ url: string; pathname: string }> {
  const out = await put(path, data, {
    access: "private",
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

export async function putPermanentBlob(path: string, data: Buffer, contentType: string): Promise<{ url: string; pathname: string }> {
  const out = await put(path, data, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  return { url: out.url, pathname: out.pathname };
}

export async function deleteBlobByUrl(url: string): Promise<void> {
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
}

export function createSignedBlobAccessUrl(blobUrl: string, origin: string, expiresAt: string): string {
  const exp = String(Math.floor(new Date(expiresAt).getTime() / 1000));
  const out = new URL("/api/blob", origin);
  out.searchParams.set("url", blobUrl);
  out.searchParams.set("exp", exp);
  out.searchParams.set("sig", signBlobUrl(blobUrl, exp));
  return out.toString();
}

export function verifySignedBlobAccessUrl(blobUrl: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;

  const expected = signBlobUrl(blobUrl, exp);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function signBlobUrl(blobUrl: string, exp: string): string {
  const secret = process.env.BLOB_ACCESS_SIGNING_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret) {
    throw new Error("blob_signing_secret_missing");
  }

  return createHmac("sha256", secret)
    .update(`${blobUrl}:${exp}`)
    .digest("base64url");
}
