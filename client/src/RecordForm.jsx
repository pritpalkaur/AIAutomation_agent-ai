import { useState } from 'react';

// <input type="datetime-local"> works in local time without a timezone suffix.
function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const EMPTY = {
  patient_name: '',
  country: '',
  pain_level: 5,
  pain_location: '',
  occurred_at: '',
  notes: '',
};

export default function RecordForm({ record, onSave, onCancel }) {
  const [form, setForm] = useState(() =>
    record
      ? { ...record, notes: record.notes ?? '', occurred_at: toLocalInput(record.occurred_at) }
      : { ...EMPTY, occurred_at: toLocalInput(new Date()) },
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
        patient_name: form.patient_name,
        country: form.country,
        pain_level: Number(form.pain_level),
        pain_location: form.pain_location,
        occurred_at: new Date(form.occurred_at).toISOString(),
        notes: form.notes,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{record ? `Edit record #${record.id}` : 'New pain record'}</h2>

        <label>
          Patient name
          <input value={form.patient_name} onChange={set('patient_name')} maxLength={200} required />
        </label>
        <label>
          Country
          <input value={form.country} onChange={set('country')} maxLength={100} required />
        </label>
        <label>
          Pain level: <strong>{form.pain_level}</strong> / 10
          <input type="range" min="0" max="10" value={form.pain_level} onChange={set('pain_level')} />
        </label>
        <label>
          Pain location
          <input value={form.pain_location} onChange={set('pain_location')} maxLength={200} required />
        </label>
        <label>
          Occurred at
          <input type="datetime-local" value={form.occurred_at} onChange={set('occurred_at')} required />
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={set('notes')} maxLength={2000} rows={3} />
        </label>

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
