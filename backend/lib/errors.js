export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.' } });
}

export function oneOf(value, allowed, fallback, name) {
  if (value === null) return fallback;
  if (!allowed.includes(value)) throw new ApiError(400, 'BAD_REQUEST', `Invalid ${name}`);
  return value;
}
