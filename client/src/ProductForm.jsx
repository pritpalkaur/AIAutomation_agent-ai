import { useState } from 'react';

const EMPTY = { name: '', price: '', stock: '', imageUrl: '' };

export default function ProductForm({ product, onSave, onCancel }) {
  const [form, setForm] = useState(() =>
    product ? { ...product, imageUrl: product.imageUrl ?? '' } : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: form.name,
        price: Number(form.price),
        stock: Number(form.stock),
        imageUrl: form.imageUrl.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{product ? `Edit product #${product.id}` : 'New product'}</h2>

        <label>
          Name
          <input value={form.name} onChange={set('name')} maxLength={100} required />
        </label>
        <div className="row">
          <label>
            Price
            <input type="number" min="0" max="99999999.99" step="0.01" value={form.price} onChange={set('price')} required />
          </label>
          <label>
            Stock
            <input type="number" min="0" step="1" value={form.stock} onChange={set('stock')} required />
          </label>
        </div>
        <label>
          Image URL <span className="hint">(optional)</span>
          <input type="url" value={form.imageUrl} onChange={set('imageUrl')} maxLength={255} placeholder="https://…" />
        </label>
        {form.imageUrl && <img className="preview" src={form.imageUrl} alt="" onError={(e) => (e.target.style.display = 'none')} />}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
