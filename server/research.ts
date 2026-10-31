export type DealerStatus = "Confirmed" | "Likely" | "Unverified";

export type ResearchedDealer = {
  name: string;
  email: string;
  city: string;
  status: DealerStatus;
  evidence: string;
  sourceUrl: string;
};

type Requirement = {
  brand?: string;
  model?: string;
  specification?: string;
  quantity?: string;
  location?: string;
  notes?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const statuses = new Set<DealerStatus>(["Confirmed", "Likely", "Unverified"]);

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Gemini did not return dealer JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as { dealers?: unknown };
}

function normalizeDealers(value: unknown): ResearchedDealer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const dealers: ResearchedDealer[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const email = String(row.email ?? "").trim().toLowerCase();
    const city = String(row.city ?? "").trim();
    const status = statuses.has(row.status as DealerStatus) ? row.status as DealerStatus : "Unverified";
    const evidence = String(row.evidence ?? "").trim();
    const sourceUrl = String(row.sourceUrl ?? "").trim();
    if (!name) continue;
    const key = email || name.toLowerCase();
    if (seen.has(key)) continue;
    if (email && !emailPattern.test(email)) continue;
    seen.add(key);
    dealers.push({
      name,
      email,
      city,
      status,
      evidence: evidence || "Public web listing; verify before sending.",
      sourceUrl,
    });
    if (dealers.length >= 12) break;
  }

  return dealers;
}

export async function researchDealers(requirement: Requirement): Promise<ResearchedDealer[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const prompt = `Find suppliers for this procurement enquiry. Do NOT limit results to authorised manufacturers.

Include three categories:
1. Confirmed — manufacturer or official authorised dealer/distributor (OEM locator or official dealer page).
2. Likely — the company's own website explicitly lists this exact item, model, or part number (they deal in this item even if authorisation is unproven).
3. Unverified — IndiaMART, TradeIndia, or similar marketplace listings that explicitly match this item/model/part number.

Brand: ${requirement.brand || "unknown"}
Model: ${requirement.model || "unknown"}
Specification: ${requirement.specification || "n/a"}
Quantity: ${requirement.quantity || "n/a"}
Delivery location: ${requirement.location || "India"}
Notes: ${requirement.notes || "n/a"}

Search official manufacturer dealer locators, OEM pages, distributor directories, supplier websites, and IndiaMART/TradeIndia.
Prefer companies near the delivery location, but still include relevant national listings.
Do not invent email addresses. If an email is not published, leave email as "".
Skip generic suppliers that do not name this product.
Return JSON only:
{
  "dealers": [
    {
      "name": "company name",
      "email": "sales@example.com or empty string",
      "city": "city, state",
      "status": "Confirmed | Likely | Unverified",
      "evidence": "one-sentence reason plus what you found",
      "sourceUrl": "https://..."
    }
  ]
}`;

  const models = [
    process.env.GEMINI_MODEL,
    "gemini-pro-latest",
    "gemini-3.1-pro-preview",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
  ].filter((model, index, list): model is string => Boolean(model) && list.indexOf(model) === index);

  let payload: {
    error?: { message?: string; status?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } = {};
  let response: Response | null = null;
  let lastError = "Gemini dealer research failed.";

  const attempts: Array<{ model: string; useSearch: boolean }> = [
    ...models.map((model) => ({ model, useSearch: true })),
    { model: "gemini-3.6-flash", useSearch: false },
    { model: "gemini-3.1-flash-lite", useSearch: false },
  ];

  for (const { model, useSearch } of attempts) {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    };
    if (useSearch) body.tools = [{ google_search: {} }];

    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      },
    );
    payload = await response.json() as typeof payload;
    if (response.ok) break;
    lastError = `${model}${useSearch ? " + search" : ""}: ${payload.error?.message || lastError}`;
  }

  if (!response?.ok) {
    throw new Error(lastError);
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  const parsed = extractJson(text);
  const dealers = normalizeDealers(parsed.dealers);
  if (dealers.length === 0) {
    throw new Error("Gemini returned no usable dealer contacts. Try a more specific brand or location.");
  }
  return dealers;
}
