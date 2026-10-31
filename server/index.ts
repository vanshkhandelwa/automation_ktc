import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type Request, type Response, type NextFunction } from "express";
import { CodeChallengeMethod } from "google-auth-library";
import { google } from "googleapis";
import {
  audit, loadTokens, recordBatchSent, removeTokens, saveTokens, wasBatchSent,
} from "./store.js";
import { researchDealers } from "./research.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const appOrigin = process.env.APP_ORIGIN || "http://localhost:5173";
const production = process.env.NODE_ENV === "production";
const cookieSecret = process.env.COOKIE_SECRET;
const oauthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_REDIRECT_URI &&
  process.env.TOKEN_ENCRYPTION_KEY &&
  cookieSecret,
);

if (!cookieSecret) {
  console.warn("COOKIE_SECRET is missing; Gmail OAuth will remain unavailable.");
}

app.use(express.json({ limit: "256kb" }));
app.use(cookieParser(cookieSecret || "development-not-configured"));

const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "lax" as const,
  signed: true,
  path: "/",
};

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

function sessionEmail(req: Request) {
  const value = req.signedCookies?.gmail_account;
  return typeof value === "string" ? value : null;
}

function requireAccount(req: Request, res: Response, next: NextFunction) {
  if (!sessionEmail(req)) {
    res.status(401).json({ error: "Connect Gmail before using this action." });
    return;
  }
  next();
}

app.get("/api/auth/status", async (req, res) => {
  const email = sessionEmail(req);
  const connected = email ? Boolean(await loadTokens(email)) : false;
  res.json({
    configured: oauthConfigured,
    connected,
    email: connected ? email : null,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post("/api/dealers/research", async (req, res) => {
  try {
    const dealers = await researchDealers(req.body ?? {});
    res.json({ dealers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dealer research failed.";
    res.status(502).json({ error: message });
  }
});

app.get("/api/auth/google", (req, res) => {
  if (!oauthConfigured) {
    res.redirect(`${appOrigin}/?gmail=not_configured`);
    return;
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  res.cookie("oauth_state", state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  res.cookie("oauth_verifier", verifier, { ...cookieOptions, maxAge: 10 * 60 * 1000 });

  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: CodeChallengeMethod.S256,
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  });
  res.redirect(url);
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const expectedState = req.signedCookies?.oauth_state;
    const verifier = req.signedCookies?.oauth_verifier;
    if (!code || !state || state !== expectedState || typeof verifier !== "string") {
      res.status(400).send("Invalid or expired OAuth request.");
      return;
    }

    const client = oauthClient();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    client.setCredentials(tokens);
    const profile = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    const email = profile.data.email?.toLowerCase();
    if (!email) throw new Error("Google did not return an email address");

    await saveTokens(email, tokens);
    await audit({ event: "gmail_connected", account: email });
    res.clearCookie("oauth_state", cookieOptions);
    res.clearCookie("oauth_verifier", cookieOptions);
    res.cookie("gmail_account", email, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect(`${appOrigin}/?gmail=connected`);
  } catch (error) {
    console.error("OAuth callback failed", error);
    res.redirect(`${appOrigin}/?gmail=error`);
  }
});

app.post("/api/auth/disconnect", requireAccount, async (req, res) => {
  const email = sessionEmail(req)!;
  const tokens = await loadTokens(email);
  if (tokens?.access_token) {
    await oauthClient().revokeToken(tokens.access_token).catch(() => undefined);
  }
  await removeTokens(email);
  await audit({ event: "gmail_disconnected", account: email });
  res.clearCookie("gmail_account", cookieOptions);
  res.json({ connected: false });
});

type SendBatchBody = {
  batchId?: string;
  subject?: string;
  body?: string;
  recipients?: Array<{ email?: string; name?: string }>;
};

function encodeMessage(to: string, subject: string, body: string) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject.replace(/[\r\n]/g, " ")}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

app.post("/api/gmail/send-batch", requireAccount, async (req, res) => {
  const email = sessionEmail(req)!;
  const { batchId, subject, body, recipients } = req.body as SendBatchBody;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!batchId || !subject?.trim() || !body?.trim() || !Array.isArray(recipients)) {
    res.status(400).json({ error: "The approved batch is incomplete." });
    return;
  }
  if (recipients.length < 1 || recipients.length > 20) {
    res.status(400).json({ error: "A batch must contain between 1 and 20 recipients." });
    return;
  }
  const addresses = [...new Set(recipients.map((item) => item.email?.trim().toLowerCase()))];
  if (addresses.some((address) => !address || !validEmail.test(address) || address.endsWith(".example"))) {
    res.status(400).json({ error: "Replace demo or invalid dealer addresses before sending." });
    return;
  }
  if (await wasBatchSent(batchId)) {
    res.status(409).json({ error: "This approved batch has already been sent." });
    return;
  }

  const stored = await loadTokens(email);
  if (!stored) {
    res.status(401).json({ error: "The Gmail connection has expired. Connect it again." });
    return;
  }
  const client = oauthClient();
  client.setCredentials(stored);
  client.on("tokens", async (fresh) => saveTokens(email, { ...stored, ...fresh }));
  const gmail = google.gmail({ version: "v1", auth: client });
  const sent: Array<{ email: string; messageId: string | null; threadId: string | null }> = [];

  for (const address of addresses as string[]) {
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodeMessage(address, subject, body) },
    });
    sent.push({ email: address, messageId: result.data.id ?? null, threadId: result.data.threadId ?? null });
  }

  await recordBatchSent(batchId);
  await audit({ event: "rfq_batch_sent", account: email, batchId, recipients: sent.length });
  res.json({ sent });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "The server could not complete the request." });
});

if (production) {
  const dist = path.resolve("dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => {
  console.log(`ProcureFlow server listening on http://localhost:${port}`);
});
