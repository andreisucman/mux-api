import csrf from "csrf";

const csrfProtection = new csrf();

export default function createCsrf() {
  const csrfSecret = csrfProtection.secretSync();
  const csrfToken = csrfProtection.create(csrfSecret);

  return { csrfSecret, csrfToken };
}
