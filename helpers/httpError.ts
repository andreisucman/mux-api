export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Error.captureStackTrace(this, HttpError);
  }
}

export default function httpError(
  input: string | Error,
  status = 500
): HttpError {
  if (input instanceof Error) {
    const error = input as Error;
    const httpError = new HttpError(status, error.message);
    httpError.stack = error.stack;
    return httpError;
  }

  return new HttpError(status, input);
}
