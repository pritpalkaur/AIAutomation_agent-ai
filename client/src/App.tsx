import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import AiImport from './AiImport';
import { formatPrice, stockClass } from './format';
import ProductForm from './ProductForm';
import type { Product, ProductPage, ProductRow } from './types';

const PAGE_SIZE = 20;

export default function App() {
  const [data, setData] = useState<Pick<ProductPage, 'items' | 'total'>>({ items: [], total: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // null = closed, 'new' = add form, product = edit form
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);

  useEffect(() => {
    api.aiStatus().then((s) => setAiEnabled(s.enabled)).catch(() => setAiEnabled(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.list({ search, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250); // small debounce while typing in search
    return () => clearTimeout(timer);
  }, [load]);

  async function handleSave(product: Product) {
    const existing = editing === 'new' ? null : editing;
    if (existing) await api.update(existing.id, product);
    else await api.create(product);
    setEditing(null);
    setNotice(existing ? 'Product updated.' : 'Product created.');
    load();
  }

  async function handleDelete(product: ProductRow) {
    if (!confirm(`Permanently delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await api.remove(product.id);
      setNotice('Product deleted.');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCheckEmail() {
    setCheckingEmail(true);
    setError('');
    try {
      const s = await api.checkEmail();
      setNotice(
        'skipped' in s
          ? s.reason
          : `Checked Gmail: ${s.emails} email(s)` +
              (s.aiEmails ? ` (${s.aiEmails} read by AI)` : '') +
              `, ${s.inserted} product(s) imported` +
              (s.rejectedRows.length ? `, ${s.rejectedRows.length} row(s) rejected (see server log)` : '') +
              (s.failedEmails.length ? `, ${s.failedEmails.length} email(s) failed` : ''),
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingEmail(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <main>
      <header>
        <h1>Products</h1>
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button className="secondary" onClick={handleCheckEmail} disabled={checkingEmail}>
            {checkingEmail ? 'Checking Gmail…' : 'Check email now'}
          </button>
          {aiEnabled && (
            <button className="secondary" onClick={() => setShowAiImport(true)}>
              ✨ AI import
            </button>
          )}
          <button onClick={() => setEditing('new')}>+ New product</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="notice" onClick={() => setNotice('')}>
          {notice}
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th />
              <th>Name</th>
              <th className="num">Price</th>
              <th className="num">Stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td className="thumb-cell">
                  {p.imageUrl ? (
                    <img className="thumb" src={p.imageUrl} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  ) : (
                    <span className="thumb placeholder">📦</span>
                  )}
                </td>
                <td>{p.name}</td>
                <td className="num">{formatPrice(p.price)}</td>
                <td className="num">
                  <span className={stockClass(p.stock)}>{p.stock === 0 ? 'Out of stock' : p.stock}</span>
                </td>
                <td className="row-actions">
                  <button className="link" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => handleDelete(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer>
        <span>{data.total} product(s)</span>
        <div className="pager">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹ Prev
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button className="secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
            Next ›
          </button>
        </div>
      </footer>

      {showAiImport && (
        <AiImport
          onClose={() => setShowAiImport(false)}
          onSaved={(count) => {
            setShowAiImport(false);
            setNotice(`AI import: ${count} product(s) saved.`);
            load();
          }}
        />
      )}

      {editing && (
        <ProductForm product={editing === 'new' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}
    </main>
  );
}
