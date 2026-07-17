import assert from "node:assert/strict";
import { isSensitiveFieldLike } from "./sensitive.ts";

assert.equal(isSensitiveFieldLike({ type: "password" }), true);
assert.equal(isSensitiveFieldLike({ type: "hidden" }), true);
assert.equal(isSensitiveFieldLike({ type: "file" }), true);
assert.equal(isSensitiveFieldLike({ autocomplete: "one-time-code" }), true);
assert.equal(isSensitiveFieldLike({ name: "api_key" }), true);
assert.equal(isSensitiveFieldLike({ name: "ssn" }), true);
assert.equal(
  isSensitiveFieldLike({ dataFlowwrightSensitive: "true" }),
  true,
);
assert.equal(isSensitiveFieldLike({ name: "invoice_number" }), false);
console.log("extension sensitive-field checks passed");
