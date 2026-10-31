export type DealerStatus = "Confirmed" | "Likely" | "Unverified";
export type Dealer = {
  id: number;
  name: string;
  email: string;
  city: string;
  status: DealerStatus;
  evidence: string;
  sourceUrl?: string;
  selected: boolean;
};

export const starterDealers: Dealer[] = [
  { id: 1, name: "Apex Pumps & Systems", email: "sales@apexpumps.example", city: "Pune, Maharashtra", status: "Confirmed", evidence: "Listed in manufacturer dealer locator", selected: true },
  { id: 2, name: "Flowtech Engineering", email: "enquiries@flowtech.example", city: "Mumbai, Maharashtra", status: "Confirmed", evidence: "Manufacturer distributor directory", selected: true },
  { id: 3, name: "Shree Industrial Stores", email: "rfq@shreeindustrial.example", city: "Nashik, Maharashtra", status: "Likely", evidence: "Product line listed; authorisation awaiting check", selected: true },
  { id: 4, name: "Prime MEP Solutions", email: "info@primemep.example", city: "Thane, Maharashtra", status: "Unverified", evidence: "General pump supplier search result", selected: false },
];

export const quoteRows = [
  { dealer: "Apex Pumps & Systems", price: "₹ 48,200", availability: "In stock", delivery: "3–5 days", status: "Replied" },
  { dealer: "Flowtech Engineering", price: "—", availability: "—", delivery: "—", status: "Awaiting reply" },
  { dealer: "Shree Industrial Stores", price: "₹ 50,850", availability: "7 days", delivery: "7–10 days", status: "Replied" },
];
