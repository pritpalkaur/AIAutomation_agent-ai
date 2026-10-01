import { useState } from 'react';
import { api } from './api';
import { formatPrice } from './format';
import type { AiExtractResult, Product } from './types';

const SAMPLE = `Hello,

Here is this week's update from Brightline Supplies:

- Wireless Mouse (Black) is now $24.99, we have 120 units ready to ship.
- The USB-C hub 7-in-1 costs 39.50 per unit (35.00 if you order 50+). Only 8 left.
- Laptop Stand Aluminium: 54.00, currently out of stock.
  Photo: https://example.com/images/laptop-stand.jpg

Best regards,
Sam`;

// Paste free-form text → AI extracts products → review → save only the valid ones.
interface Props {
  onClose: () => void;
  onSaved: (count: number) => void;
}

export default function AiImport({ onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AiExtractResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function extract() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.aiExtract(text));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    const valid = result.products.filter((p) => !p.errors.length);
    setBusy(true);
    setError('');
    try {
      // Rows without errors always have a price and stock, so they match Product.
      for (const { errors, ...product } of valid) await api.create(product as Product);
      onSaved(valid.length);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const validCount = result?.products.filter((p) => !p.errors.length).length ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>✨ AI import from text</h2>
        <p className="hint">
          Paste an email, such as a supplier price list. AI finds each product and turns it into a record.
          Nothing is saved until you click Save.
        </p>

        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste email text here…" />

        <div className="actions">
          <button type="button" className="secondary" onClick={() => setText(SAMPLE)}>
            Use sample text
          </button>
          <button type="button" onClick={extract} disabled={busy || !text.trim()}>
            {busy && !result ? 'Extracting…' : 'Extract with AI'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {result && (
          <>
            <p className="hint">
              Found {result.products.length} product(s), {validCount} valid · model {result.model} ·{' '}
              {result.usage.input_tokens + result.usage.output_tokens} tokens
            </p>
            {result.products.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="num">Price</th>
                      <th className="num">Stock</th>
                      <th>Image URL</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.products.map((p, i) => (
                      <tr key={i} className={p.errors.length ? 'invalid' : ''}>
                        <td>{p.name || '—'}</td>
                        <td className="num">{formatPrice(p.price)}</td>
                        <td className="num">{p.stock ?? '—'}</td>
                        <td className="url">{p.imageUrl || '—'}</td>
                        <td>{p.errors.length ? `⚠️ ${p.errors.join(', ')}` : '✅ Ready'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          {result && (
            <button type="button" onClick={save} disabled={busy || validCount === 0}>
              Save {validCount} product(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
