/**
 * Regression guard for Phase 6.3.
 *
 * The codebase previously had two places that did:
 *   process.env.SESSION_SECRET || "math_collective_secret_2026..."
 *
 * The fallback was dead code in practice (env validation refuses to
 * boot without SESSION_SECRET ≥ 16 chars), but it masked
 * misconfiguration during development and is exactly the kind of
 * thing that quietly creeps back in via a copy-paste from older
 * commits, npm-search snippets, or AI suggestions.
 *
 * This test grep-scans backend/ for the fallback string in
 * SOURCE CODE positions (excluding comments / docstrings). If the
 * fallback ever returns as a real `||` expression, this test fails
 * and points at the file:line.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function listJsFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listJsFiles(full, acc);
    else if (e.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

// Simple scanner — drops single-line and trivial multi-line comments.
// Doesn't try to be a perfect lexer; just good enough that comments
// referencing the old fallback don't false-positive the test.
function nonCommentLines(src) {
  let out = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    let trimmed = line;
    // Strip block-comment runs
    if (inBlock) {
      const end = trimmed.indexOf("*/");
      if (end === -1) { out.push(""); continue; }
      trimmed = trimmed.slice(end + 2);
      inBlock = false;
    }
    while (true) {
      const start = trimmed.indexOf("/*");
      if (start === -1) break;
      const end = trimmed.indexOf("*/", start + 2);
      if (end === -1) {
        trimmed = trimmed.slice(0, start);
        inBlock = true;
        break;
      }
      trimmed = trimmed.slice(0, start) + trimmed.slice(end + 2);
    }
    // Strip line comment (// ...) but only when it's outside a string.
    // Cheap heuristic: cut at " //" or "\t//" or start-of-line "//".
    const lineCommentIdx = trimmed.search(/(^|\s)\/\//);
    if (lineCommentIdx !== -1) {
      const before = trimmed.slice(0, lineCommentIdx);
      // Leave the line if it looks like the // is inside a string.
      // (None of our actual code uses // inside strings, so this is
      // a pragmatic shortcut.)
      trimmed = before;
    }
    out.push(trimmed);
  }
  return out;
}

describe("Session-secret fallback must NEVER reappear in source code", () => {
  it("no SESSION_SECRET || \"...\" expression in backend/", () => {
    const files = listJsFiles(path.resolve("backend"));
    const violations = [];

    for (const file of files) {
      const lines = nonCommentLines(fs.readFileSync(file, "utf8"));
      lines.forEach((ln, i) => {
        // The thing we're guarding against: the literal expression
        // SESSION_SECRET || "<some string>". A regex catches both
        // "math_collective_secret..." and any future variant a
        // contributor might invent.
        if (/SESSION_SECRET\s*\|\|\s*["'`]/.test(ln)) {
          violations.push(
            `  ${path.relative(process.cwd(), file)}:${i + 1}  ${ln.trim()}`
          );
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        "SESSION_SECRET fallback expression detected in source — " +
        "production session secrets must come from env (validated by " +
        "validateEnv to be ≥ 16 chars), never a literal string:\n" +
        violations.join("\n")
      );
    }

    expect(violations).toEqual([]);
  });
});
