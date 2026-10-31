import { useEffect, useMemo, useState } from "react";
import {
  Bell, Check, ChevronRight, FileText, ImageUp, Mail, MapPin,
  Menu, Search, ShieldCheck, Sparkles, Upload,
} from "lucide-react";
import { quoteRows, type Dealer } from "./data";

type Screen = "enquiry" | "dealers" | "review" | "tracking";
type Requirement = {
  brand: string;
  model: string;
  specification: string;
  quantity: string;
  location: string;
  notes: string;
};

const steps: { id: Screen; label: string; icon: typeof FileText }[] = [
  { id: "enquiry", label: "New enquiry", icon: FileText },
  { id: "dealers", label: "Dealer shortlist", icon: Search },
  { id: "review", label: "Review & send", icon: Mail },
  { id: "tracking", label: "Reply tracker", icon: Bell },
];

function App() {
  const [screen, setScreen] = useState<Screen>("enquiry");
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [researchError, setResearchError] = useState("");
  const [gmail, setGmail] = useState<{ configured: boolean; connected: boolean; email: string | null }>({
    configured: false, connected: false, email: null,
  });
  const [batchId] = useState(() => crypto.randomUUID());
  const [researching, setResearching] = useState(false);
  const [imageName, setImageName] = useState("");
  const [requirement, setRequirement] = useState({
    brand: "Kirloskar Brothers Limited",
    model: "CPFM65/32",
    specification: "65 × 100 mm · Pump No. 1781924010 · Mfg. 03/2024",
    quantity: "1",
    location: "Pune, Maharashtra",
    notes: "Please quote price, availability, warranty, GST and freight charges.",
  });

  const selected = useMemo(() => dealers.filter((dealer) => dealer.selected), [dealers]);
  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then(setGmail)
      .catch(() => setGmail({ configured: false, connected: false, email: null }));
    const url = new URL(window.location.href);
    if (url.searchParams.has("gmail")) {
      url.searchParams.delete("gmail");
      window.history.replaceState({}, "", url);
    }
  }, []);
  const updateRequirement = (key: keyof typeof requirement, value: string) =>
    setRequirement((current) => ({ ...current, [key]: value }));
  const toggleDealer = (id: number) =>
    setDealers((current) => current.map((dealer) => dealer.id === id ? { ...dealer, selected: !dealer.selected } : dealer));
  const updateDealerEmail = (id: number, email: string) =>
    setDealers((current) => current.map((dealer) => dealer.id === id ? { ...dealer, email } : dealer));

  const research = async () => {
    setResearching(true);
    setResearchError("");
    try {
      const response = await fetch("/api/dealers/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requirement),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Dealer research failed.");
      const next: Dealer[] = (result.dealers ?? []).map((dealer: Omit<Dealer, "id" | "selected">, index: number) => ({
        ...dealer,
        id: index + 1,
        selected: dealer.status !== "Unverified" && Boolean(dealer.email),
      }));
      setDealers(next);
      setScreen("dealers");
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Dealer research failed.");
    } finally {
      setResearching(false);
    }
  };

  const sendBatch = async () => {
    if (!gmail.connected) {
      window.location.assign("/api/auth/google");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const response = await fetch("/api/gmail/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          subject: `Requirement for ${requirement.brand} ${requirement.model}`,
          body: mailBody,
          recipients: selected.map(({ name, email }) => ({ name, email })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send this batch.");
      setSent(true);
      setScreen("tracking");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send this batch.");
    } finally {
      setSending(false);
    }
  };

  const disconnectGmail = async () => {
    await fetch("/api/auth/disconnect", { method: "POST" });
    setGmail({ configured: true, connected: false, email: null });
  };

  const mailBody = `Dear Sir/Madam,\n\nWe have a requirement for a ${requirement.brand} pump, Model ${requirement.model}.\n\nSpecification: ${requirement.specification}\nQuantity: ${requirement.quantity}\nDelivery location: ${requirement.location}\n\n${requirement.notes}\n\nKindly also confirm that you are an authorised dealer for this model.\n\nRegards,\n[Your name]\n[Company]`;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">P</div><span>ProcureFlow</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {steps.map(({ id, label, icon: Icon }, index) => (
            <button className={`nav-item ${screen === id ? "active" : ""}`} key={id} onClick={() => setScreen(id)}>
              <span className="step-number">{index + 1}</span><Icon size={17} />{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="gmail-status"><span className={`status-dot ${gmail.connected ? "online" : ""}`} />{gmail.connected ? gmail.email : "Gmail not connected"}</div>
          <button className="connect-button" onClick={() => gmail.connected ? disconnectGmail() : window.location.assign("/api/auth/google")}>
            {gmail.connected ? "Disconnect Gmail" : gmail.configured ? "Connect Gmail" : "Set up Gmail OAuth"}
          </button>
        </div>
      </aside>

      <main>
        <header>
          <button className="menu" aria-label="Menu"><Menu size={20} /></button>
          <div className="breadcrumb">Procurement <ChevronRight size={15} /> <span>{steps.find((step) => step.id === screen)?.label}</span></div>
          <div className="header-actions"><button className="icon-button"><Bell size={19} /></button><div className="avatar">VK</div></div>
        </header>

        <section className="content">
          {screen === "enquiry" && <EnquiryPage requirement={requirement} update={updateRequirement} imageName={imageName} setImageName={setImageName} researching={researching} error={researchError} onResearch={research} />}
          {screen === "dealers" && <DealersPage dealers={dealers} toggleDealer={toggleDealer} updateDealerEmail={updateDealerEmail} onContinue={() => setScreen("review")} />}
          {screen === "review" && <ReviewPage selected={selected} body={mailBody} sent={sent} gmail={gmail} sending={sending} error={sendError} onSend={sendBatch} />}
          {screen === "tracking" && <TrackingPage sent={sent} onNew={() => { setSent(false); setScreen("enquiry"); }} />}
        </section>
      </main>
    </div>
  );
}

function EnquiryPage({ requirement, update, imageName, setImageName, researching, error, onResearch }: {
  requirement: Requirement; update: (key: keyof Requirement, value: string) => void;
  imageName: string; setImageName: (value: string) => void; researching: boolean; error: string; onResearch: () => void;
}) {
  const fields: { key: keyof Requirement; label: string }[] = [
    { key: "brand", label: "Brand / manufacturer" }, { key: "model", label: "Model number" },
    { key: "specification", label: "Specification" }, { key: "quantity", label: "Quantity" }, { key: "location", label: "Delivery location" },
  ];
  return <><div className="page-heading"><div><p className="eyebrow">START A PROCUREMENT</p><h1>What do you need to source?</h1><p>Describe the item or upload a nameplate. Review the extracted details before we find dealers.</p></div><div className="secure-badge"><ShieldCheck size={18} />Approval required before sending</div></div>
    <div className="intake-grid">
      <div className="card intake-card">
        <div className="card-title"><Sparkles size={19} />Item details</div>
        <div className="field-grid">{fields.map((field) => <label key={field.key}>{field.label}<input value={requirement[field.key]} onChange={(event) => update(field.key, event.target.value)} /></label>)}</div>
        <label>Additional request<textarea rows={3} value={requirement.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      </div>
      <div className="card upload-card"><ImageUp size={27} /><h3>Upload a product image</h3><p>Use a pump nameplate, catalogue page, or product photograph.</p><label className="upload-control"><Upload size={16} />{imageName || "Choose image"}<input type="file" accept="image/*" onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")} /></label>{imageName && <small><Check size={14} /> Ready to analyse: {imageName}</small>}</div>
    </div>
    {error && <div className="error-message">{error}</div>}
    <div className="action-row"><p><Sparkles size={16} />Gemini searches official manufacturer and distributor sources on the public web.</p><button className="primary" onClick={onResearch} disabled={researching}>{researching ? "Finding dealers…" : "Find authorised dealers"}<ChevronRight size={17} /></button></div>
  </>;
}

function DealersPage({ dealers, toggleDealer, updateDealerEmail, onContinue }: {
  dealers: Dealer[];
  toggleDealer: (id: number) => void;
  updateDealerEmail: (id: number, email: string) => void;
  onContinue: () => void;
}) {
  return <><div className="page-heading"><div><p className="eyebrow">DEALER RESEARCH</p><h1>Dealer shortlist</h1><p>Review evidence before including a dealer in this enquiry batch.</p></div><div className="research-complete"><Check size={17} />Live Gemini search</div></div>
    <div className="notice"><ShieldCheck size={18} /><div><strong>Authorisation is evidence-based.</strong><br />Gemini searched the public web. Only “Confirmed” dealers were found on an official manufacturer or distributor page. Check emails before sending.</div></div>
    {dealers.length === 0 && <div className="warning"><Search size={18} /><div><strong>No dealers yet</strong><br />Run Find authorised dealers from the enquiry screen.</div></div>}
    <div className="card table-card"><table><thead><tr><th>Send</th><th>Dealer / email</th><th>Verification</th><th>Evidence</th><th>Location</th></tr></thead><tbody>{dealers.map((dealer) => <tr key={dealer.id}><td><button className={`check ${dealer.selected ? "checked" : ""}`} onClick={() => toggleDealer(dealer.id)} aria-label={`Toggle ${dealer.name}`}>{dealer.selected && <Check size={14} />}</button></td><td><strong>{dealer.name}</strong><input className="email-input" aria-label={`${dealer.name} email`} value={dealer.email} onChange={(event) => updateDealerEmail(dealer.id, event.target.value)} /></td><td><span className={`pill ${dealer.status.toLowerCase()}`}>{dealer.status}</span></td><td>{dealer.evidence}{dealer.sourceUrl && <> · <a href={dealer.sourceUrl} target="_blank" rel="noreferrer">source</a></>}</td><td><MapPin size={14} /> {dealer.city}</td></tr>)}</tbody></table></div>
    <div className="action-row"><p>{dealers.filter((dealer) => dealer.selected).length} dealers selected</p><button className="primary" onClick={onContinue}>Create email previews <ChevronRight size={17} /></button></div>
  </>;
}

function ReviewPage({ selected, body, sent, gmail, sending, error, onSend }: {
  selected: Dealer[]; body: string; sent: boolean;
  gmail: { configured: boolean; connected: boolean; email: string | null };
  sending: boolean; error: string; onSend: () => void;
}) {
  return <><div className="page-heading"><div><p className="eyebrow">FINAL APPROVAL</p><h1>Review emails before sending</h1><p>Each dealer receives an individual email. Recipient lists are never shared.</p></div><div className="secure-badge"><ShieldCheck size={18} />{selected.length} individual emails</div></div>
    <div className="review-grid"><div className="card recipients"><div className="card-title">Recipients</div>{selected.map((dealer) => <div className="recipient" key={dealer.id}><div className="recipient-logo">{dealer.name.slice(0, 1)}</div><div><strong>{dealer.name}</strong><span>{dealer.email}</span></div><Check size={17} /></div>)}</div>
      <div className="card email-preview"><div className="preview-top"><span>Subject</span><strong>Requirement for Kirloskar CPFM65/32 Pump</strong></div><pre>{body}</pre></div></div>
    {!gmail.connected && <div className="warning"><Mail size={18} /><div><strong>{gmail.configured ? "Connect Gmail to send" : "Gmail OAuth configuration required"}</strong><br />{gmail.configured ? "Google will ask you to approve the Gmail permissions before any email can be sent." : "Copy .env.example to .env and add your Google Cloud OAuth credentials first."}</div></div>}
    {gmail.connected && <div className="notice"><Check size={18} /><div><strong>Connected as {gmail.email}</strong><br />Approval will send one separate email to each selected dealer.</div></div>}
    {error && <div className="error-message">{error}</div>}
    <div className="action-row"><p>{sent ? "Batch approved and added to tracker." : "Sending is only available after your final approval."}</p><button className="primary" onClick={onSend} disabled={selected.length === 0 || sending}>{sending ? "Sending…" : gmail.connected ? `Approve & send ${selected.length} emails` : "Connect Gmail"}<Mail size={16} /></button></div>
  </>;
}

function TrackingPage({ sent, onNew }: { sent: boolean; onNew: () => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">QUOTE COMPARISON</p><h1>Kirloskar CPFM65/32</h1><p>{sent ? "Your approved RFQ batch is being tracked." : "Example tracker data shown until a batch is sent."}</p></div><button className="secondary" onClick={onNew}>New enquiry</button></div>
    <div className="stats"><div className="stat"><span>Dealers contacted</span><strong>3</strong></div><div className="stat"><span>Quotations received</span><strong>2</strong></div><div className="stat"><span>Awaiting reply</span><strong>1</strong></div><div className="stat"><span>Best quoted price</span><strong>₹ 48,200</strong></div></div>
    <div className="card table-card"><table><thead><tr><th>Dealer</th><th>Quoted price</th><th>Availability</th><th>Delivery</th><th>Status</th></tr></thead><tbody>{quoteRows.map((quote) => <tr key={quote.dealer}><td><strong>{quote.dealer}</strong></td><td>{quote.price}</td><td>{quote.availability}</td><td>{quote.delivery}</td><td><span className={`pill ${quote.status === "Replied" ? "confirmed" : "likely"}`}>{quote.status}</span></td></tr>)}</tbody></table></div>
    <div className="card automation-note"><Sparkles size={19} /><div><strong>Reply extraction is ready for Gmail integration</strong><p>When Gmail is connected, incoming quotes will be matched to this enquiry and fields such as GST, freight, warranty and payment terms will be extracted for review.</p></div></div>
  </>;
}

export default App;
