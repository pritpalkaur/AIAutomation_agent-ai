async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.errors?.join(', ') || body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  list: ({ search, page, pageSize }) =>
    request(`/pain-records?${new URLSearchParams({ search, page, pageSize })}`),
  create: (record) => request('/pain-records', { method: 'POST', body: JSON.stringify(record) }),
  update: (id, record) =>
    request(`/pain-records/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  remove: (id) => request(`/pain-records/${id}`, { method: 'DELETE' }),
  checkEmail: () => request('/email/fetch', { method: 'POST' }),
  aiStatus: () => request('/ai/status'),
  aiExtract: (text) => request('/ai/extract', { method: 'POST', body: JSON.stringify({ text }) }),
};
