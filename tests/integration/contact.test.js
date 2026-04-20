/**
 * Integration tests — contactController.js sendContactMessage.
 *
 * The controller does 3 things:
 *   1. Zod-validates via /contact/send route's validateBody wrapper.
 *   2. HTML-escapes every user-controlled field before embedding in
 *      the email body (prevents injection in the admin inbox).
 *   3. Sends two emails — one to admin, one auto-reply to the user —
 *      via nodemailer.
 *
 * Tests mock nodemailer so no real SMTP call fires, capture the
 * sent messages, and assert the escape + shape invariants.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const sentMessages = [];
let sendMailBehaviour = "ok"; // "ok" | "throw"

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (msg) => {
        sentMessages.push(msg);
        if (sendMailBehaviour === "throw") throw new Error("SMTP down");
        return { accepted: [msg.to] };
      },
    }),
  },
}));

beforeEach(() => {
  sentMessages.length = 0;
  sendMailBehaviour = "ok";
  process.env.CONTACT_EMAIL = "inbox@mc.edu";
  process.env.CONTACT_APP_PASSWORD = "app-pass";
  vi.clearAllMocks();
});

const routes = (await import("../../backend/routes/contactRoutes.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/contact", routes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

describe("POST /api/contact/send — validation", () => {
  it("400 when required fields are missing (Zod)", async () => {
    const res = await request(buildApp()).post("/api/contact/send").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("400 when email is not a valid email address", async () => {
    const res = await request(buildApp()).post("/api/contact/send")
      .send({ name: "x", email: "not-an-email", subject: "s", message: "hello world" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/contact/send — email dispatch", () => {
  it("200 happy path — sends BOTH admin message + user auto-reply", async () => {
    const res = await request(buildApp()).post("/api/contact/send")
      .send({ name: "Alice", email: "alice@x.edu", subject: "Help please", message: "Line 1\nLine 2" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Two messages: one to admin inbox, one auto-reply to the user.
    expect(sentMessages.length).toBe(2);
    const [toAdmin, autoReply] = sentMessages;
    expect(toAdmin.to).toBe("inbox@mc.edu");
    expect(toAdmin.replyTo).toBe("alice@x.edu");
    expect(toAdmin.subject).toContain("Help please");
    expect(autoReply.to).toBe("alice@x.edu");
    expect(autoReply.subject).toMatch(/got your message/i);
  });

  it("HTML-escapes user-controlled fields in the admin email body", async () => {
    await request(buildApp()).post("/api/contact/send").send({
      name: '<script>alert(1)</script>',
      email: "e@x.edu",
      subject: "Sub <b>",
      message: "Raw & dangerous > chars",
    });
    const html = sentMessages[0].html;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; dangerous &gt;");
  });

  it("sanitises CR/LF from the subject header (prevents email header injection)", async () => {
    await request(buildApp()).post("/api/contact/send").send({
      name: "A", email: "a@x.edu",
      subject: "Legit\r\nBcc: sneaky@attacker.com",
      message: "hello world",
    });
    const admin = sentMessages[0];
    expect(admin.subject).not.toContain("\r");
    expect(admin.subject).not.toContain("\n");
  });

  it("500 when SMTP rejects the send", async () => {
    sendMailBehaviour = "throw";
    const res = await request(buildApp()).post("/api/contact/send")
      .send({ name: "A", email: "a@x.edu", subject: "S", message: "hello world" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to send/i);
  });
});
