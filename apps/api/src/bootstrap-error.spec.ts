import assert from "node:assert/strict";
import test from "node:test";
import {
  getApiBootstrapFailureMessage,
  shouldLogApiBootstrapErrorDetails,
} from "./bootstrap-error";

test("getApiBootstrapFailureMessage gives actionable guidance for occupied API ports", () => {
  const message = getApiBootstrapFailureMessage({
    code: "EADDRINUSE",
    port: 3201,
  });

  assert.match(message, /API port 3201 is already in use/);
  assert.match(message, /Stop the existing API process/);
  assert.match(message, /corepack pnpm dev/);
  assert.match(message, /PORT/);
});

test("getApiBootstrapFailureMessage reports permission-blocked ports", () => {
  const message = getApiBootstrapFailureMessage({
    code: "EACCES",
    port: 3201,
  });

  assert.match(message, /API port 3201 cannot be opened/);
  assert.match(message, /PORT/);
});

test("getApiBootstrapFailureMessage falls back for unrelated bootstrap failures", () => {
  assert.equal(
    getApiBootstrapFailureMessage(new Error("database unavailable")),
    "API bootstrap failed",
  );
});

test("shouldLogApiBootstrapErrorDetails hides noisy details for known port failures", () => {
  assert.equal(
    shouldLogApiBootstrapErrorDetails({ code: "EADDRINUSE", port: 3201 }),
    false,
  );
  assert.equal(
    shouldLogApiBootstrapErrorDetails({ code: "EACCES", port: 3201 }),
    false,
  );
  assert.equal(
    shouldLogApiBootstrapErrorDetails(new Error("database unavailable")),
    true,
  );
});
