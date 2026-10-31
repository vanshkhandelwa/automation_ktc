# automation_ktc

Krishna Trading Company procurement automation: ProcureFlow UI, Cursor RFQ agent rules, RFQ tracking, and related scripts.

A first-release procurement workflow UI. It accepts an image or text requirement, shows a sourced dealer shortlist, requires batch approval before sending, and displays quotation tracking.

## Run locally

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:5173` and the API at `http://localhost:3001`.

## Connect your Gmail account

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable **Gmail API** under APIs & Services.
3. Configure the OAuth consent screen. During testing, add your personal Gmail address as a test user.
4. Create an **OAuth client ID** with application type **Web application**.
5. Add this authorised redirect URI exactly:

   `http://localhost:3001/api/auth/google/callback`

6. Create the local configuration:

```bash
cp .env.example .env
openssl rand -base64 32
openssl rand -base64 32
```

7. Put the client ID, client secret, and the two generated random values into `.env`.
8. Restart `npm run dev`, then click **Connect Gmail** in the sidebar.

OAuth tokens are encrypted with AES-256-GCM and stored under the ignored `data/` directory. The browser receives only a signed, HTTP-only account cookie; the Google client secret and refresh token remain server-side.

Dealer research uses Gemini (`gemini-pro-latest`, then `gemini-3.1-pro-preview`, then `gemini-3.6-flash`) with Google Search grounding when quota allows. Put `GEMINI_API_KEY` in `.env`. The key stays on the server; the browser never sees it. Search results are still evidence, not proof of authorisation.

For a deployed version, change `APP_ORIGIN` and `GOOGLE_REDIRECT_URI` to HTTPS URLs, add that redirect URI in Google Cloud, use managed encrypted storage, and set `NODE_ENV=production`.

## What is implemented

- Editable procurement requirement and product-image input.
- Dealer verification statuses and evidence display.
- Per-recipient RFQ preview and mandatory approval step.
- Quotation comparison interface.
- Dealer shortlists are researched with Gemini + Google Search; quote tracking still uses sample data until Gmail replies are parsed.
- Approved batches can be sent through a connected Gmail account after demo addresses are replaced with real, validated recipient addresses.

## Production integration checklist

The OAuth and Gmail sending backend is implemented. Remaining production work:

1. Complete Google OAuth verification if users beyond your configured test accounts will use the app.
2. Treat Gemini search hits as evidence, not guaranteed authorisation, and keep Unverified dealers unselected by default.
3. Persist enquiries, dealer records, sent Gmail message IDs, reply history, and extracted quote fields in a managed database.
4. Add Gmail history polling or Pub/Sub push notifications to match replies to an enquiry.
5. Move encrypted tokens and audit records from local files to managed encrypted storage before multi-user deployment.

For early testing, use a separate Gmail test account and a controlled set of known dealer/test recipient addresses.
