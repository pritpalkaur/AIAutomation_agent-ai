import type { AiExtractResult, AiStatus, InboxResult, Product, ProductPage, ProductRow } from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.errors?.join(', ') || body.error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  list: ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) =>
    request<ProductPage>(
      `/products?${new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) })}`,
    ),
  create: (product: Product) =>
    request<ProductRow>('/products', { method: 'POST', body: JSON.stringify(product) }),
  update: (id: number, product: Product) =>
    request<ProductRow>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) }),
  remove: (id: number) => request<null>(`/products/${id}`, { method: 'DELETE' }),
  checkEmail: () => request<InboxResult>('/email/fetch', { method: 'POST' }),
  aiStatus: () => request<AiStatus>('/ai/status'),
  aiExtract: (text: string) =>
    request<AiExtractResult>('/ai/extract', { method: 'POST', body: JSON.stringify({ text }) }),
};
