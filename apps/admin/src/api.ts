export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, csrfToken?: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(csrfToken === undefined ? {} : { 'x-csrf-token': csrfToken }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const code =
      typeof result === 'object' && result !== null && 'error' in result
        ? String(result.error)
        : 'REQUEST_FAILED';
    throw new ApiError(response.status, code);
  }
  return result as T;
}
