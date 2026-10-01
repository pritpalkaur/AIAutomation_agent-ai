import { useState } from 'react';
import { api } from './api.js';

const SAMPLE = `Hi team,

Patient Asha Verma from India called this morning. She has severe pain in her lower back,
about 8 out of 10, since lifting a heavy box. Taking ibuprofen.

Also, Liam Carter (Canada) reported mild wrist pain yesterday at 3pm after typing all day.

Thanks,
Front desk`;

// Paste free-form text → AI extracts records → review → save only the valid ones.
export default function AiImport({ onClose, onSaved }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function extract() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.aiExtract(text));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const valid = result.records.filter((r) => !r.errors.length);
    setBusy(true);
    setError('');
    try {
      for (const { errors, ...record } of valid) await api.create(record);
      onSaved(valid.length);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const validCount = result?.records.filter((r) => !r.errors.length).length ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>✨ AI import from text</h2>
        <p className="hint">
          Paste an email or note. AI finds each pain report and turns it into a record. Nothing is saved
          until you click Save.
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
              Found {result.records.length} record(s), {validCount} valid · model {result.model} ·{' '}
              {result.usage.input_tokens + result.usage.output_tokens} tokens
            </p>
            {result.records.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Country</th>
                      <th>Pain</th>
                      <th>Location</th>
                      <th>Occurred</th>
                      <th>Notes</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.records.map((r, i) => (
                      <tr key={i} className={r.errors.length ? 'invalid' : ''}>
                        <td>{r.patient_name || '—'}</td>
                        <td>{r.country || '—'}</td>
                        <td>{r.pain_level}</td>
                        <td>{r.pain_location}</td>
                        <td>{r.occurred_at ? new Date(r.occurred_at).toLocaleString() : '—'}</td>
                        <td className="notes">{r.notes}</td>
                        <td>{r.errors.length ? `⚠️ ${r.errors.join(', ')}` : '✅ Ready'}</td>
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
              Save {validCount} record(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
