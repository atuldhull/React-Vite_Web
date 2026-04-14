/**
 * Shared validation plumbing.
 *
 * `validateBody(schema)` returns an Express middleware that:
 *   - Runs the Zod schema against `req.body`.
 *   - On success, REPLACES req.body with the parsed value (so
 *     coerced types, trimmed strings, and default-applied fields
 *     flow to the controller; no "is it already an int?" guesswork).
 *   - On failure, responds 400 with a stable shape:
 *       {
 *         error:     "Validation failed",
 *         requestId: "<x-request-id echoed here>",
 *         issues:    [
 *           { path: "email",    message: "Invalid email" },
 *           { path: "password", message: "Too short"    },
 *           ...
 *         ]
 *       }
 *     — which gives the client enough detail to render per-field
 *     errors and gives us a request id to grep for in logs.
 *
 * Why not throw from the schema and let the error handler catch it?
 * Because the error handler converts everything to a generic 500
 * "Internal server error" to avoid leaking stack traces. Validation
 * errors are *supposed* to leak: the whole point is to tell the
 * client exactly what's wrong so they can fix it. Handling them
 * here keeps 500s reserved for genuine server bugs.
 */

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error:     "Validation failed",
        code:      "VALIDATION_FAILED",  // explicit — the shim's status-derived default would say "BAD_REQUEST"
        requestId: req.id,
        issues:    result.error.issues.map(i => ({
          path:    i.path.join("."),
          message: i.message,
        })),
      });
    }
    // Let the parsed (coerced/defaulted/trimmed) value flow downstream.
    req.body = result.data;
    next();
  };
}

/**
 * Same pattern for query params. Used sparingly — most GET routes
 * don't need Zod validation because they're read-only and the query
 * parser already hands us strings. Useful for endpoints that accept
 * numeric ranges, enums, or pagination cursors.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return res.status(400).json({
        error:     "Invalid query",
        code:      "VALIDATION_FAILED",
        requestId: req.id,
        issues:    result.error.issues.map(i => ({
          path:    i.path.join("."),
          message: i.message,
        })),
      });
    }
    req.query = result.data;
    next();
  };
}
