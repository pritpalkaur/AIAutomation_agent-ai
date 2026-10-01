export const formatPrice = (value: number | string | null | undefined): string =>
  value == null || value === '' || Number.isNaN(Number(value))
    ? '—'
    : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const LOW_STOCK = 10;

export function stockClass(stock: number): string {
  if (stock === 0) return 'stock out';
  if (stock < LOW_STOCK) return 'stock low';
  return 'stock ok';
}
