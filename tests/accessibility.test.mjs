import test from 'node:test';
import assert from 'node:assert/strict';
import { radioNavigation } from '../components/forms/radioNavigation.js';

test('radio keys wrap, skip disabled choices, and select the focused choice', () => {
  const previousDocument = globalThis.document;
  const document = { activeElement: null };
  globalThis.document = document;
  const choices = Array.from({ length: 4 }, (_, index) => ({
    disabled: index === 1,
    getAttribute: () => null,
    focus() { document.activeElement = this; },
    click() { selected = index; },
  }));
  let selected = -1;
  let prevented = 0;
  const press = key => radioNavigation({ key, currentTarget: { querySelectorAll: () => choices }, preventDefault() { prevented++; } });
  try {
    choices[0].focus();
    press('ArrowRight'); assert.equal(selected, 2);
    press('End'); assert.equal(selected, 3);
    press('ArrowDown'); assert.equal(selected, 0);
    press('ArrowLeft'); assert.equal(selected, 3);
    press('Home'); assert.equal(selected, 0);
    press('Tab'); assert.equal(prevented, 5); assert.equal(selected, 0);
    assert.equal(document.activeElement, choices[0]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
