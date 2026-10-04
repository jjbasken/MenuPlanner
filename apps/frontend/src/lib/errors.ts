/** Human-readable message from a tRPC/zod error, for showing next to a form. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!err || typeof err !== 'object') return fallback
  const e = err as { message?: string; data?: { zodError?: { fieldErrors?: Record<string, string[]> } } }
  const fieldErrors = e.data?.zodError?.fieldErrors
  if (fieldErrors) {
    const [field, msgs] = Object.entries(fieldErrors).find(([, m]) => m?.length) ?? []
    if (field && msgs) return `${field}: ${msgs[0]}`
  }
  // Raw zod issue arrays arrive as a JSON string in `message`.
  if (e.message?.startsWith('[')) return fallback
  return e.message || fallback
}
