import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type { Credentials } from "google-auth-library";

const dataDir = path.resolve("data");

function encryptionKey() {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  return key;
}

function accountFile(email: string) {
  const id = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return path.join(dataDir, `gmail-${id}.json`);
}

export async function saveTokens(email: string, tokens: Credentials) {
  await mkdir(dataDir, { recursive: true });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const payload = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  };
  await writeFile(accountFile(email), JSON.stringify(payload), { mode: 0o600 });
}

export async function loadTokens(email: string): Promise<Credentials | null> {
  try {
    const payload = JSON.parse(await readFile(accountFile(email), "utf8"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.value, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function removeTokens(email: string) {
  const { rm } = await import("node:fs/promises");
  await rm(accountFile(email), { force: true });
}

type AuditEvent = {
  event: "gmail_connected" | "gmail_disconnected" | "rfq_batch_sent";
  account: string;
  batchId?: string;
  recipients?: number;
  timestamp: string;
};

export async function audit(event: Omit<AuditEvent, "timestamp">) {
  await mkdir(dataDir, { recursive: true });
  await appendFile(
    path.join(dataDir, "audit.jsonl"),
    `${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}

const sentFile = path.join(dataDir, "sent-batches.json");

export async function wasBatchSent(batchId: string) {
  try {
    const ids = JSON.parse(await readFile(sentFile, "utf8")) as string[];
    return ids.includes(batchId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function recordBatchSent(batchId: string) {
  await mkdir(dataDir, { recursive: true });
  let ids: string[] = [];
  try {
    ids = JSON.parse(await readFile(sentFile, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!ids.includes(batchId)) ids.push(batchId);
  await writeFile(sentFile, JSON.stringify(ids.slice(-500)), { mode: 0o600 });
}
