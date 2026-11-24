'use strict';
// Saved search strings (for example from poe.re) for the in-game search box.
const MAX_REGEX = 250; // length limit of the search box in Path of Exile 1

/** One line without control characters, or null if it is empty. Inner spaces matter, so they are kept. */
function cleanRegex(text) {
  const s = String(text == null ? '' : text).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
  return s || null;
}
/** Why a regex cannot be used, or null. A cut-off regex would search for the wrong thing, so it is never shortened. */
function regexProblem(text) {
  const s = cleanRegex(text);
  if (!s) return 'empty';
  return [...s].length > MAX_REGEX ? 'too long' : null;
}

module.exports = { MAX_REGEX, cleanRegex, regexProblem };
