import { test } from "node:test";
import assert from "node:assert/strict";

import { BANKS, POPULAR_BANKS, searchBanks, findBank, formatAccountNumber, maskAccountNumber } from "../lib/banks.js";

test("the bank list has no duplicates, and every popular bank is on it", () => {
  const keys = BANKS.map((b) => b.toUpperCase());
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(BANKS.length >= 590);
  for (const b of POPULAR_BANKS) assert.ok(BANKS.includes(b), b);
});

test("banks are found by nickname, part of the name, or typed without spaces", () => {
  const first = (q) => searchBanks(q, 1)[0];
  assert.equal(first("gtb"), "GUARANTY TRUST BANK");
  assert.equal(first("GTBank"), "GUARANTY TRUST BANK");
  assert.equal(first("uba"), "UNITED BANK FOR AFRICA");
  assert.equal(first("first bank"), "FIRST BANK OF NIGERIA");
  assert.equal(first("firstbank"), "FIRST BANK OF NIGERIA");
  assert.equal(first("opay"), "OPAY DIGITAL SERVICES LIMITED");
  assert.equal(first("Kuda"), "KUDA MICROFINANCE BANK");
  assert.equal(first("zenith"), "ZENITH BANK");
  assert.equal(first("polaris"), "POLARIS BANK LTD");
  // "MFB" and "Microfinance Bank" are the same thing, and the list's misspellings still match.
  assert.equal(first("lapo microfinance"), "LAPO MFB");
  assert.equal(first("bubayero microfinance"), "BUBAYERO MICORFINANCE BANK");
  assert.ok(searchBanks("fi ba").includes("FIDELITY BANK"));
  assert.deepEqual(searchBanks("zzzz"), []);
  assert.deepEqual(searchBanks(""), POPULAR_BANKS.slice(0, 50));
});

test("a typed bank name resolves to its listed spelling", () => {
  assert.equal(findBank("access bank"), "ACCESS BANK");
  assert.equal(findBank("gtb"), "GUARANTY TRUST BANK");
  assert.equal(findBank("Lapo Microfinance Bank"), "LAPO MFB");
  assert.equal(findBank("Made Up Bank"), null);
});

test("account numbers print in groups, or masked to the last four digits", () => {
  assert.equal(formatAccountNumber("0123456789"), "012 345 6789");
  assert.equal(maskAccountNumber("0123456789"), "•••• 6789");
});
