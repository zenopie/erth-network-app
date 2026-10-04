// Shared by every check file: the PASS/FAIL line, the exit code, and the LCD
// stub most of them use. Import it first, so WebCrypto exists before any
// module under test is evaluated.
import { webcrypto } from "node:crypto";

// Node 18 has no global WebCrypto in ES modules; the browser always does.
globalThis.crypto ??= webcrypto;

let bad = 0;

/** Prints one result line; a false `cond` makes the run exit 1. */
export const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined && detail !== "" ? " — " + detail : ""}`);
  if (!cond) bad++;
};

/** Ends the run: exit 1 if any check failed. */
export const done = () => process.exit(bad ? 1 : 0);

export const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

export const rejects = async (p) => {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
};

export const b64 = (bytes) => Buffer.from(bytes).toString("base64");

/**
 * Stubs fetch with LCD answers shaped like the chain's grpc-gateway JSON.
 * `routes` maps a path (from /cosmos/ or /earth/ on, no query) to a body, or
 * to a function of the query's URLSearchParams returning one. No body is a
 * 404. The object stays live: add or delete routes as a check needs them.
 */
export function stubLcd(routes) {
  globalThis.fetch = async (url) => {
    const path = String(url).replace(/^.*?(\/(cosmos|earth)\/)/, "$1").split("?")[0];
    const route = routes[path];
    const body = typeof route === "function" ? route(new URL(String(url), "http://lcd").searchParams) : route;
    if (!body) return { ok: false, status: 404, text: async () => "unstubbed " + path };
    return { ok: true, json: async () => body };
  };
  return routes;
}
