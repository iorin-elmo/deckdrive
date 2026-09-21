export function apiPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  return port;
}
