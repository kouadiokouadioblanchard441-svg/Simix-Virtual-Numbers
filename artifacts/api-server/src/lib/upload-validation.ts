export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;

export function imageSignatureMatches(contentType: string, body: Buffer): boolean {
  switch (contentType) {
    case "image/jpeg":
      return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    case "image/png":
      return body.length >= 8
        && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return body.length >= 6
        && ["GIF87a", "GIF89a"].includes(body.subarray(0, 6).toString("ascii"));
    case "image/webp":
      return body.length >= 12
        && body.subarray(0, 4).toString("ascii") === "RIFF"
        && body.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}
