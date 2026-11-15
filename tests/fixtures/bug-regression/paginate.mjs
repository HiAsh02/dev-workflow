/**
 * Minimal fixture with a deterministic off-by-one pagination bug for scenario tests.
 */
export function paginate(items, page = 1, pageSize = 10) {
  if (!Array.isArray(items) || page < 1 || pageSize < 1) {
    throw new RangeError("Invalid pagination arguments");
  }
  // Intentional fixture bug: skips first item on page 1 when pageSize > 0 if offset uses page instead of page - 1
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}
