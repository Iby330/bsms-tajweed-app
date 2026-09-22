import { describe, expect, it } from "vitest";
import {
  confirmationHtml, confirmationText, loginHtml, loginText,
  type Confirmation, type Login,
} from "./applicant-emails";

const base: Confirmation = {
  firstName: "Yusuf",
  section: "brothers",
  phone: "+44 7700900123",
  feeLabel: "£15",
  paidConfirmed: false,
  whatsappLink: "https://chat.whatsapp.com/BROTHERS",
  paymentLink: null,
};

const login: Login = {
  firstName: "Maryam",
  email: "maryam@example.com",
  section: "sisters",
  className: "Sisters Group 2",
  link: "https://www.bsmstajweed.com/auth/confirm?token_hash=abc&type=recovery&next=%2Fwelcome",
};

/** Every email, in every state the fee and WhatsApp lines can be in. */
const all = [
  confirmationHtml(base), confirmationText(base),
  confirmationHtml({ ...base, whatsappLink: null }),
  confirmationHtml({ ...base, paymentLink: "https://pay.example/x" }),
  confirmationHtml({ ...base, paidConfirmed: true }),
  loginHtml(login), loginText(login),
];

describe("applicant emails", () => {
  it("never uses an em dash where a user reads (house style)", () => {
    for (const mail of all) {
      expect(mail).not.toMatch(/—|&mdash;/);
    }
  });

  it("escapes what the applicant typed", () => {
    const html = confirmationHtml({ ...base, firstName: `<script>x</script>"` });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gives the side's WhatsApp group when there is one", () => {
    const html = confirmationHtml(base);
    expect(html).toContain('href="https://chat.whatsapp.com/BROTHERS"');
    expect(html).toContain("brothers' WhatsApp group");
    expect(confirmationText(base)).toContain("https://chat.whatsapp.com/BROTHERS");
  });

  it("says we'll message them when no group link is set", () => {
    const html = confirmationHtml({ ...base, whatsappLink: null });
    expect(html).not.toContain("chat.whatsapp.com");
    expect(html).toContain("+44 7700900123");
  });

  it("asks for payment only when there is a link and they haven't said they paid", () => {
    const pay = "https://pay.example/x";
    expect(confirmationHtml({ ...base, paymentLink: pay })).toContain(`href="${pay}"`);
    expect(confirmationHtml({ ...base, paymentLink: pay, paidConfirmed: true }))
      .not.toContain(`href="${pay}"`);
    expect(confirmationHtml(base)).toContain("payment details separately");
  });

  it("puts the set-password link and the login address in the login email", () => {
    const html = loginHtml(login);
    // & in the link is escaped in HTML attributes, as it must be.
    expect(html).toContain("token_hash=abc&amp;type=recovery");
    expect(html).toContain("maryam@example.com");
    expect(html).toContain("Sisters Group 2");
    expect(loginText(login)).toContain(login.link);
  });

  it("never states a password", () => {
    expect(loginText(login)).not.toMatch(/password:\s*\S{6,}/i);
  });
});
