# Synthetic invoice approval example

This fixture demonstrates Flowwright's controlled browser-workflow prototype without using real companies, people, invoices, or financial data. Each JSON file represents already-extracted invoice content so the deterministic test runner can focus on workflow decisions.

| Case                      | Expected route      | Reason                                                                                                   |
| ------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| Exact match               | `approval_required` | PO-1001 exists and the totals match. A human approval gate is still required before any external action. |
| Amount mismatch           | `exception`         | The invoice and purchase-order totals differ.                                                            |
| Missing purchase order    | `human_review`      | A safe lookup cannot be performed.                                                                       |
| Unreadable invoice number | `human_review`      | Extraction confidence is too low.                                                                        |

`purchase_orders.csv` is the synthetic lookup source and `expected_results.json` is the test oracle. The prototype does not post payments or update an external accounting system.
