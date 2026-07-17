export function isSensitiveFieldLike(attrs: {
  tagName?: string;
  type?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  dataFlowwrightSensitive?: string | null;
  dataSensitive?: string | null;
}): boolean {
  const type = (attrs.type || "text").toLowerCase();
  if (type === "password" || type === "hidden" || type === "file") return true;
  if (attrs.dataFlowwrightSensitive === "true" || attrs.dataSensitive === "true") {
    return true;
  }
  const autocomplete = (attrs.autocomplete || "").toLowerCase();
  if (
    [
      "cc-number",
      "cc-csc",
      "cc-exp",
      "cc-exp-month",
      "cc-exp-year",
      "one-time-code",
      "current-password",
      "new-password",
      "password",
    ].includes(autocomplete)
  ) {
    return true;
  }
  const hint =
    `${type} ${attrs.name ?? ""} ${attrs.id ?? ""} ${autocomplete} ${attrs.ariaLabel ?? ""} ${attrs.placeholder ?? ""}`.toLowerCase();
  return /password|passcode|otp|one[- ]?time|card|cvv|cvc|credit|ssn|social.?security|api[-_]?key|token|secret|iban|account.?number/.test(
    hint,
  );
}
