import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import AiImport from './AiImport.jsx';
import RecordForm from './RecordForm.jsx';

const PAGE_SIZE = 20;

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');

function painClass(level) {
  if (level >= 7) return 'pain high';
  if (level >= 4) return 'pain medium';
  return 'pain low';
}

export default function App() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, record = edit
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250); // small debounce while typing in search
    return () => clearTimeout(timer);
  }, [load]);

  async function handleSave(record) {
    if (editing.id) await api.update(editing.id, record);
    else await api.create(record);
    setEditing(null);
    setNotice(editing.id ? 'Record updated.' : 'Record created.');
    load();
  }

  async function handleDelete(record) {
    if (!confirm(`Delete the record for ${record.patient_name}?`)) return;
    try {
      await api.remove(record.id);
      setNotice('Record deleted.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCheckEmail() {
    setCheckingEmail(true);
    setError('');
    try {
      const s = await api.checkEmail();
      setNotice(
        s.skipped
          ? s.reason
          : `Checked Gmail: ${s.emails} email(s)` +
              (s.aiEmails ? ` (${s.aiEmails} read by AI)` : '') +
              `, ${s.inserted} row(s) imported` +
              (s.rejectedRows.length ? `, ${s.rejectedRows.length} row(s) rejected (see server log)` : '') +
              (s.failedEmails.length ? `, ${s.failedEmails.length} email(s) failed` : ''),
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingEmail(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <main>
      <header>
        <h1>Pain Records</h1>
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search name, country or location…"
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
          <button onClick={() => setEditing({})}>+ New record</button>
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
              <th>Patient</th>
              <th>Country</th>
              <th>Pain</th>
              <th>Location</th>
              <th>Occurred</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.patient_name}</td>
                <td>{r.country}</td>
                <td>
                  <span className={painClass(r.pain_level)}>{r.pain_level}</span>
                </td>
                <td>{r.pain_location}</td>
                <td>{formatDate(r.occurred_at)}</td>
                <td className="notes">{r.notes}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => handleDelete(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer>
        <span>{data.total} record(s)</span>
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
            setNotice(`AI import: ${count} record(s) saved.`);
            load();
          }}
        />
      )}

      {editing && (
        <RecordForm
          record={editing.id ? editing : null}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </main>
  );
}
