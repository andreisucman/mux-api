export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
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
    const httpError = new HttpError(error.message, status);
    httpError.stack = error.stack;
    return httpError;
  }

  return new HttpError(input, status);
}
