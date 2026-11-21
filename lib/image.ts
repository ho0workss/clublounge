/**
 * Image helpers for pictures that are stored inline (as data URLs) inside
 * `cl_records.data` / `cl_branding.logo_url`.
 *
 * Every stored byte is re-downloaded on each list fetch, so these images are
 * the single biggest driver of database size and egress. Keep them small:
 * WebP at a modest edge length is roughly 10-20x cheaper than the raw file.
 */

/** Longest-edge budget, in px, per kind of inline image. */
export const IMAGE_MAX_PX = {
  /** 주류 사진 — rendered in a ~44px row thumbnail / small preview. */
  liquor: 220,
  /** 소속 로고 — rendered in the header at ~32-40px. */
  logo: 256,
} as const;

export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("파일을 읽을 수 없습니다."));
    fr.readAsDataURL(file);
  });
  return await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("이미지를 읽을 수 없습니다."));
    im.src = dataUrl;
  });
}

/**
 * Downscale to `max` on the longest edge and encode compactly.
 * Prefers WebP (keeps transparency, ~30% smaller than JPEG); falls back to
 * JPEG, then PNG, on browsers that cannot encode WebP.
 */
export function shrinkToDataUrl(
  img: HTMLImageElement,
  max: number,
  quality = 0.7
): string {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

  for (const type of ["image/webp", "image/jpeg", "image/png"]) {
    const url = canvas.toDataURL(type, quality);
    // A browser that cannot encode `type` silently returns a PNG instead.
    if (url.startsWith(`data:${type}`)) return url;
  }
  return canvas.toDataURL();
}

/** Read an image file and return a storage-ready, downscaled data URL. */
export async function fileToStoredImage(
  file: File,
  max: number,
  quality = 0.7
): Promise<string> {
  return shrinkToDataUrl(await loadImageFile(file), max, quality);
}

/* ------------------------------------------------------------------ *
 * Storage-backed uploads
 *
 * Inline data URLs are what pushed the previous project past its
 * db-size / egress quotas: the bytes live in `cl_records.data` and get
 * re-sent on every list fetch. Uploading to the `cl-images` bucket
 * instead means the row carries only a short CDN URL, and the picture is
 * served once and cached by the browser.
 *
 * The bucket is public-read with upload-only write, so a replaced photo
 * leaves its old object behind rather than letting the browser key delete
 * arbitrary files. Orphans are cheap at this scale.
 * ------------------------------------------------------------------ */

import { supabase } from "./supabase";

export const IMAGE_BUCKET = "cl-images";

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head)?.[1] ?? "image/webp";
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Downscale `file`, upload it, and return a URL safe to put in a record.
 *
 * Falls back to the (still downscaled) inline data URL if the upload does
 * not go through — a missing bucket, a storage policy that rejects the
 * insert, or no network. Callers get a usable value either way, so this is
 * safe to ship before the bucket exists.
 */
export async function uploadStoredImage(
  file: File,
  max: number,
  folder: string,
  quality = 0.7
): Promise<string> {
  const dataUrl = await fileToStoredImage(file, max, quality);
  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext = EXT[blob.type] ?? "webp";
    const name = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(name, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (error) throw error;
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(name);
    if (!data?.publicUrl) throw new Error("no public url");
    return data.publicUrl;
  } catch {
    // Storage unavailable — keep the inline copy so the feature still works.
    return dataUrl;
  }
}
