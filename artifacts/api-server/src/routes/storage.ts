import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import express from "express";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { isPersistentRateLimited } from "../lib/rate-limiter";
import {
  ALLOWED_IMAGE_TYPES,
  imageSignatureMatches,
  MAX_IMAGE_UPLOAD_BYTES,
} from "../lib/upload-validation";

const RequestUploadUrlBody = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
  contentType: z.string().transform((value) => value.split(";")[0].trim().toLowerCase())
    .refine((value) => Object.hasOwn(ALLOWED_IMAGE_TYPES, value), "Unsupported image type"),
});
const RequestUploadUrlResponse = z.object({
  uploadURL: z.string().url(),
  objectPath: z.string(),
  metadata: z.object({ name: z.string(), size: z.number(), contentType: z.string() }),
});
const FinalizeUploadBody = z.object({
  objectPath: z.string().regex(
    /^\/objects\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/* ── Uploads directory for direct (non-GCS) uploads ── */
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function resolveUploadPath(filename: string): string {
  const resolved = path.resolve(UPLOAD_DIR, filename);
  if (path.dirname(resolved) !== UPLOAD_DIR) {
    throw new Error("Invalid upload path");
  }
  return resolved;
}

async function enforceAdminUploadRateLimit(req: Request, res: Response): Promise<boolean> {
  const adminId = req.adminPayload?.sub;
  if (!adminId) {
    res.status(401).json({ error: "Session administrateur requise." });
    return false;
  }
  const ip = req.ip ?? "unknown";
  if (
    await isPersistentRateLimited(`image-upload-admin:${adminId}`, 60, 60 * 60_000)
    || await isPersistentRateLimited(`image-upload-ip:${ip}`, 100, 60 * 60_000)
  ) {
    res.setHeader("Retry-After", "3600");
    res.status(429).json({ error: "Trop de téléversements. Réessayez plus tard." });
    return false;
  }
  return true;
}

function hasUploadDiskCapacity(incomingBytes: number): boolean {
  const configuredReserve = Number(process.env.UPLOAD_MIN_FREE_BYTES);
  const reserveBytes = Number.isSafeInteger(configuredReserve) && configuredReserve >= 0
    ? configuredReserve
    : 256 * 1024 * 1024;
  try {
    const stats = fs.statfsSync(UPLOAD_DIR);
    return stats.bavail * stats.bsize >= reserveBytes + incomingBytes;
  } catch {
    return false;
  }
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload via Replit object storage (GCS).
 * Falls back gracefully — if the sidecar is unavailable use /uploads/direct.
 */
router.post("/storage/uploads/request-url", requireAdminJwt, async (req: Request, res: Response) => {
  if (!await enforceAdminUploadRateLimit(req, res)) return;
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.warn({ err: error }, "GCS upload URL unavailable — client should fall back to /uploads/direct");
    res.status(503).json({ error: "GCS unavailable", fallback: "/api/storage/uploads/direct" });
  }
});

/**
 * POST /storage/uploads/direct
 *
 * Filesystem-based direct upload for environments where the Replit GCS
 * sidecar is not available (Plesk, VPS, Docker, etc.).
 *
 * Client must send the raw image bytes with the correct Content-Type header:
 *   fetch('/api/storage/uploads/direct', { method: 'POST', body: file, headers: { 'Content-Type': file.type } })
 *
 * Returns { url: string, objectPath: string } — same shape as the GCS flow.
 */
router.post(
  "/storage/uploads/direct",
  requireAdminJwt,
  express.raw({ type: "image/*", limit: `${MAX_IMAGE_UPLOAD_BYTES}b` }),
  async (req: Request, res: Response) => {
    if (!await enforceAdminUploadRateLimit(req, res)) return;
    const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();

    if (!Object.hasOwn(ALLOWED_IMAGE_TYPES, contentType)) {
      res.status(415).json({ error: "Formats acceptés : JPEG, PNG, GIF ou WebP" });
      return;
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Corps de la requête vide ou invalide" });
      return;
    }
    if (!imageSignatureMatches(contentType, body)) {
      res.status(400).json({ error: "Le contenu ne correspond pas au format d’image annoncé." });
      return;
    }
    if (!hasUploadDiskCapacity(body.length)) {
      res.status(507).json({ error: "Espace de stockage insuffisant pour cet upload." });
      return;
    }

    const ext = ALLOWED_IMAGE_TYPES[contentType as keyof typeof ALLOWED_IMAGE_TYPES];
    const filename = `${randomUUID()}.${ext}`;

    try {
      /* The filename is generated server-side and sendFile's root prevents
       * a request parameter from escaping the upload directory. */
      const filepath = resolveUploadPath(filename);
      /* filename is a server-generated UUID and resolveUploadPath proves
       * the destination remains directly inside UPLOAD_DIR. */
      // nosemgrep: javascript.express.file.fs-express.fs-express
      fs.writeFileSync(filepath, body, { flag: "wx", mode: 0o644 });
      const url = `/api/storage/uploads/files/${filename}`;
      res.json({ url, objectPath: url });
    } catch (err) {
      req.log.error({ err }, "Direct upload: failed to write file");
      res.status(500).json({ error: "Échec de l'enregistrement du fichier" });
    }
  },
);

/** Validate GCS uploads before making them publicly readable. */
router.post("/storage/uploads/finalize", requireAdminJwt, async (req: Request, res: Response) => {
  if (!await enforceAdminUploadRateLimit(req, res)) return;
  const parsed = FinalizeUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Chemin d’upload invalide." });
    return;
  }

  let objectFile: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>> | undefined;
  try {
    objectFile = await objectStorageService.getObjectEntityFile(parsed.data.objectPath);
    const [metadata] = await objectFile.getMetadata();
    const size = Number(metadata.size);
    const contentType = String(metadata.contentType ?? "").split(";")[0].trim().toLowerCase();
    if (
      !Number.isSafeInteger(size)
      || size <= 0
      || size > MAX_IMAGE_UPLOAD_BYTES
      || !Object.hasOwn(ALLOWED_IMAGE_TYPES, contentType)
    ) {
      await objectFile.delete().catch(() => undefined);
      res.status(400).json({ error: "Format ou taille d’image invalide (5 Mo maximum)." });
      return;
    }

    const [contents] = await objectFile.download();
    if (!imageSignatureMatches(contentType, contents)) {
      await objectFile.delete().catch(() => undefined);
      res.status(400).json({ error: "Le contenu ne correspond pas au format d’image annoncé." });
      return;
    }

    const publicPath = await objectStorageService.trySetObjectEntityAclPolicy(
      parsed.data.objectPath,
      { owner: req.adminPayload!.sub, visibility: "public" },
    );
    res.json({ url: `/api/storage${publicPath}`, objectPath: publicPath });
  } catch (error) {
    if (objectFile) await objectFile.delete().catch(() => undefined);
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Fichier temporaire introuvable." });
      return;
    }
    req.log.warn({ err: error }, "Could not validate uploaded object");
    res.status(503).json({ error: "Impossible de valider l’image téléversée." });
  }
});

/**
 * GET /storage/uploads/files/:filename
 *
 * Serve files uploaded via /uploads/direct.
 */
router.get("/storage/uploads/files/:filename", (req: Request, res: Response) => {
  const { filename } = req.params as Record<string, string>;

  if (!filename || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|gif|webp)$/i.test(filename)) {
    res.status(400).end();
    return;
  }

  const filepath = resolveUploadPath(filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Fichier introuvable" });
    return;
  }

  const ext = path.extname(filename).slice(1).toLowerCase();
  const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filename, { root: UPLOAD_DIR, dotfiles: "deny" });
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const aclPolicy = await getObjectAclPolicy(objectFile);
    const legacyPublicUpload = !aclPolicy
      && /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(wildcardPath);
    const hasPermission = aclPolicy
      ? await objectStorageService.canAccessObjectEntity({
          userId: req.user?.id,
          objectFile,
        })
      : legacyPublicUpload;
    if (!hasPermission) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
