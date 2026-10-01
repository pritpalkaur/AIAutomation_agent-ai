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
    request(`/products?${new URLSearchParams({ search, page, pageSize })}`),
  create: (product) => request('/products', { method: 'POST', body: JSON.stringify(product) }),
  update: (id, product) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) }),
  remove: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  checkEmail: () => request('/email/fetch', { method: 'POST' }),
  aiStatus: () => request('/ai/status'),
  aiExtract: (text) => request('/ai/extract', { method: 'POST', body: JSON.stringify({ text }) }),
};
