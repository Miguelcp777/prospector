import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const contract = css.slice(css.indexOf("/* V36 global WCAG contrast contract"));

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("semantic text colors meet WCAG AA in every application theme", () => {
  for (const theme of ["dark", "light", "ocean", "emerald", "violet"]) {
    const block = contract.match(new RegExp(`\\.theme-${theme}\\{([^}]+)\\}`))?.[1];
    assert.ok(block, `missing ${theme} contrast tokens`);
    const tokens = Object.fromEntries(
      [...block.matchAll(/--(contrast-[a-z]+):(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]),
    );
    for (const token of ["contrast-text", "contrast-soft", "contrast-muted", "contrast-accent"])
      assert.ok(contrast(tokens["contrast-surface"], tokens[token]) >= 4.5, `${theme} ${token} is below 4.5:1`);
  }
});
