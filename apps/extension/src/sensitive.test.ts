import { isSensitiveFieldLike } from "./sensitive.ts";

function assertEqual(actual: boolean, expected: boolean, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(isSensitiveFieldLike({ type: "password" }), true, "password");
assertEqual(isSensitiveFieldLike({ type: "hidden" }), true, "hidden");
assertEqual(isSensitiveFieldLike({ type: "file" }), true, "file");
assertEqual(
  isSensitiveFieldLike({ autocomplete: "one-time-code" }),
  true,
  "otp autocomplete",
);
assertEqual(isSensitiveFieldLike({ name: "api_key" }), true, "api_key");
assertEqual(isSensitiveFieldLike({ name: "ssn" }), true, "ssn");
assertEqual(
  isSensitiveFieldLike({ dataFlowwrightSensitive: "true" }),
  true,
  "dataFlowwrightSensitive",
);
assertEqual(
  isSensitiveFieldLike({ name: "invoice_number" }),
  false,
  "invoice_number",
);
console.log("extension sensitive-field checks passed");
