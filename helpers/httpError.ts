export class HttpError extends Error {
  forward: boolean;
  status: number;

  constructor(forward: boolean, status: number, message: string) {
    super(message);
    this.status = status;
    this.forward = forward;
    Error.captureStackTrace(this, HttpError);
  }
}

export default function httpError(
  input: string | Error,
  forward = false,
  status = 500
): HttpError {
  if (input instanceof Error) {
    const error = input as Error;
    const httpError = new HttpError(forward, status, error.message);
    httpError.stack = error.stack;
    return httpError;
  }

  return new HttpError(forward, status, input);
}
