// The site-wide Content-Security-Policy. The base directives go on every response; pages add a
// script-src keyed to a per-request nonce, which Next stamps on its own scripts. 'strict-dynamic'
// lets those scripts load the app's chunks, so no host list is needed. Styles stay unrestricted:
// React style attributes, the org chart and the floor drawings' <style> blocks rely on inline CSS.
export const BASE_CSP = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";

export function pageCsp(nonce: string, { dev }: { dev: boolean }): string {
  // React's development build uses eval to rebuild server error stacks; production never does.
  const eval_ = dev ? " 'unsafe-eval'" : "";
  return `${BASE_CSP}; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${eval_}`;
}

export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}
