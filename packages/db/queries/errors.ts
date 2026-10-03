// Expected failures from a write: a duplicate email, a seat already taken, a loop in the org
// chart. Server actions show these to the admin. Anything else is a bug and is rethrown.
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
