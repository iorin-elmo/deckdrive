export function apiPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  return port;
}

export function apiCorsOrigins(value: string | undefined): readonly string[] {
  const configured = value === undefined || value.length === 0 ? 'http://localhost:5173' : value;
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (origins.length === 0) throw new Error('CORS_ORIGINS must include at least one origin.');
  return origins;
}
