import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FaEnvelope, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

function normalizeEmailHref(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("mailto:") ? trimmed : `mailto:${trimmed}`;
}

function getSocialLinks() {
  const emailHref = normalizeEmailHref(import.meta.env.VITE_FOOTER_EMAIL_URL);
  const instagramHref = String(import.meta.env.VITE_FOOTER_INSTAGRAM_URL || "").trim();
  const xHref = String(import.meta.env.VITE_FOOTER_X_URL || "").trim();
  const linkedinHref = String(import.meta.env.VITE_FOOTER_LINKEDIN_URL || "").trim();

  return [
    emailHref
      ? {
          key: "email",
          href: emailHref,
          label: "Email",
          Icon: FaEnvelope,
          external: false,
        }
      : null,
    instagramHref
      ? {
          key: "instagram",
          href: instagramHref,
          label: "Instagram",
          Icon: FaInstagram,
          external: true,
        }
      : null,
    xHref
      ? {
          key: "x",
          href: xHref,
          label: "X",
          Icon: FaXTwitter,
          external: true,
        }
      : null,
    linkedinHref
      ? {
          key: "linkedin",
          href: linkedinHref,
          label: "LinkedIn",
          Icon: FaLinkedinIn,
          external: true,
        }
      : null,
  ].filter(Boolean);
}

const Footer = () => {
  const { t } = useTranslation();
  const socialLinks = getSocialLinks();

  return (
    <footer className="bg-blue-700 px-4 py-10 text-white sm:px-10 lg:px-20">
      <div className="mx-auto grid max-w-[96rem] gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <div className="text-center lg:text-left">
          <h2 className="mb-5 font-extrabold">Dillar Academy</h2>

          <div className="flex flex-col gap-y-2 sm:gap-y-3 lg:text-lg">
            <Link href="/contact" className="underline underline-offset-4">
              {t("contact_text")}
            </Link>
          </div>
        </div>

        <div className="flex justify-center">
          <Link
            href="/donate"
            className="inline-flex min-w-[200px] items-center justify-center rounded-lg bg-white px-8 py-4 text-lg font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
          >
            Donate
          </Link>
        </div>

        <div className="flex justify-center lg:justify-end">
          {socialLinks.length > 0 ? (
            <div className="flex items-center gap-3 lg:gap-4">
              {socialLinks.map(({ key, href, label, Icon, external }) => (
                <a
                  key={key}
                  href={href}
                  aria-label={label}
                  title={label}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer noopener" : undefined}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white hover:text-blue-700"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
};

export default Footer;