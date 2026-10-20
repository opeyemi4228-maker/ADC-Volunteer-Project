import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePhone, formatPhone, isValidName, properCase, ageOn, normalizeUrl, normalizeHandle, nameSimilarity, isValidIsoDate } from "../lib/validate.js";

test("phone numbers normalise to E.164 from every common form (§5 step 1)", () => {
  for (const input of ["08031234567", "+2348031234567", "2348031234567", "0803 123 4567", "(0803)-123-4567", "8031234567"]) {
    assert.equal(normalizePhone(input), "+2348031234567", input);
  }
  assert.equal(normalizePhone("0703 000 0000"), "+2347030000000");
  for (const bad of ["", "12345", "0603123456", "080312345678", "+447911123456", "abc"]) assert.equal(normalizePhone(bad), null, bad);
  assert.equal(formatPhone("+2348031234567"), "0803 123 4567");
});

test("names accept Hausa, Yoruba and Igbo letters and tone marks (§11)", () => {
  for (const name of ["Ƙasimu", "Ɗahiru", "Ɓala", "Ƴusuf", "Adébáyọ̀", "Olúwaṣeun", "Ifeọma", "Ụchenna", "O'Neil", "Ade-Bello"]) {
    assert.ok(isValidName(name), name);
  }
  for (const bad of ["", "A", "John3", "<script>", "Mr.", "a".repeat(51)]) assert.ok(!isValidName(bad), bad);
  assert.equal(properCase("aDEKUNLE o'neil-bello"), "Adekunle O'Neil-Bello");
});

test("volunteers must be 18 on the day they register (§6 step 2)", () => {
  const on = new Date("2026-09-26T12:00:00");
  assert.equal(ageOn("2008-09-26", on), 18);
  assert.equal(ageOn("2008-09-27", on), 17);
  assert.ok(isValidIsoDate("2000-02-29"));
  assert.ok(!isValidIsoDate("2001-02-29"));
});

test("URLs and social handles are normalised but never block (§5 step 5b)", () => {
  assert.equal(normalizeUrl("kubwayouth.ng"), "https://kubwayouth.ng");
  assert.equal(normalizeUrl("not a url"), null);
  for (const input of ["@kubwayouth", "kubwayouth", "https://facebook.com/kubwayouth", "facebook.com/kubwayouth/"]) {
    const h = normalizeHandle("facebook", input);
    assert.equal(h.handle, "kubwayouth", input);
    assert.equal(h.url, "https://facebook.com/kubwayouth", input);
  }
  assert.equal(normalizeHandle("x", "https://twitter.com/@kyv").handle, "kyv");
  assert.equal(normalizeHandle("tiktok", "@kyv").url, "https://tiktok.com/@kyv");
});

test("similar group names are caught; different ones are not (§11)", () => {
  assert.ok(nameSimilarity("Kubwa Youth Vanguard", "Kubwa Youths Vanguard") > 0.8);
  assert.ok(nameSimilarity("Kano Youths for Change", "Kano Youth For Change") > 0.8);
  assert.ok(nameSimilarity("Kubwa Youth Vanguard", "Bwari Market Women Forum") < 0.4);
});
