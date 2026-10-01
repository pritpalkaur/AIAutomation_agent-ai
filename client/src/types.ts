// Shapes of the JSON the Express API sends and receives.

export interface Product {
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
}

/** A product as stored in dbo.Products. */
export interface ProductRow extends Product {
  id: number;
}

export interface ProductPage {
  total: number;
  page: number;
  pageSize: number;
  items: ProductRow[];
}

export interface InboxSummary {
  emails: number;
  attachments: number;
  aiEmails: number;
  inserted: number;
  rejectedRows: { subject: string; file: string; row: number; errors: string[] }[];
  failedEmails: { uid: number; error: string }[];
}

export type InboxResult = InboxSummary | { skipped: true; reason: string };

export interface AiStatus {
  enabled: boolean;
  model: string | null;
}

/** One product found by the AI, with the server's validation problems (empty when it can be saved). */
export interface ExtractedProduct {
  name: string;
  price: number | null;
  stock: number | null;
  imageUrl: string | null;
  errors: string[];
}

export interface AiExtractResult {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  products: ExtractedProduct[];
}
