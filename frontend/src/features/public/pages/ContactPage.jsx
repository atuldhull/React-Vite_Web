import { motion } from "framer-motion";
import { useState } from "react";
import CosmicPortalBackground from "@/components/backgrounds/CosmicPortalBackground";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import InputField from "@/components/ui/InputField";
import { contact } from "@/lib/api";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await contact.send(form);
      setSuccess(true);
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <>
      <CosmicPortalBackground />
      <div className="relative z-10 space-y-10 pb-16">
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-secondary">
            Get In Touch
          </p>
          <h1 className="mt-4 font-display text-5xl font-extrabold tracking-[-0.06em] text-white sm:text-6xl">
            Contact Us
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-text-muted">
            Have a question, suggestion, or want to collaborate? Reach out to the Math Collective team.
          </p>
        </motion.section>

        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_0.8fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card variant="glass">
              {success ? (
                <div className="py-10 text-center">
                  <p className="text-4xl">✅</p>
                  <h3 className="mt-4 font-display text-2xl font-bold text-white">Message Sent!</h3>
                  <p className="mt-2 text-text-muted">We'll get back to you as soon as possible.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-6"
                    onClick={() => setSuccess(false)}
                  >
                    Send Another
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <h3 className="font-display text-xl font-bold text-white">Send a Message</h3>

                  {error && (
                    <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                      {error}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Name"
                      placeholder="Your name"
                      value={form.name}
                      onChange={update("name")}
                      required
                    />
                    <InputField
                      label="Email"
                      type="email"
                      placeholder="you@university.edu"
                      value={form.email}
                      onChange={update("email")}
                      required
                    />
                  </div>
                  <InputField
                    label="Subject"
                    placeholder="What's this about?"
                    value={form.subject}
                    onChange={update("subject")}
                    required
                  />
                  <InputField
                    label="Message"
                    placeholder="Tell us more..."
                    value={form.message}
                    onChange={update("message")}
                    multiline
                    required
                  />
                  <Button type="submit" loading={loading} className="w-full justify-center" size="lg">
                    Send Message
                  </Button>
                </form>
              )}
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            <Card variant="solid">
              <h3 className="font-display text-lg font-bold text-white">Quick Info</h3>
              <div className="mt-4 space-y-4">
                {[
                  { label: "Email", value: "mathcollective@bmsit.in", icon: "📧" },
                  { label: "Location", value: "BMSIT Campus, Bangalore", icon: "📍" },
                  { label: "Hours", value: "Mon-Fri, 9 AM - 5 PM IST", icon: "🕐" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span className="text-lg">{item.icon}</span>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-white">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card variant="glass">
              <h3 className="font-display text-lg font-bold text-white">FAQ</h3>
              <div className="mt-4 space-y-3">
                {[
                  { q: "How do I join?", a: "Register with your university email and start solving challenges." },
                  { q: "Is it free?", a: "Yes! Core features are free for all university students." },
                  { q: "Can my university join?", a: "Absolutely! Contact us and we'll set up your organization." },
                ].map((faq) => (
                  <div key={faq.q} className="rounded-xl border border-line/10 bg-black/10 px-4 py-3">
                    <p className="text-sm font-medium text-white">{faq.q}</p>
                    <p className="mt-1 text-xs text-text-muted">{faq.a}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}
