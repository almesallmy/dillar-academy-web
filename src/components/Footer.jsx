import { useTranslation } from "react-i18next";
import { Link } from "wouter";

const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className="min-h-60 lg:min-h-80 bg-blue-700 text-white flex justify-center items-center px-4 sm:px-10 lg:px-20 py-10">
      <div className="max-w-[96rem] w-full flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-extrabold mb-5">Dillar Academy</h1>

          <div className="flex flex-col gap-y-2 sm:gap-y-3 lg:text-lg">
            <a href="mailto:info@dillaracademy.org">
              {t("email")}: info@dillaracademy.org
            </a>

            <a
              href="https://www.instagram.com/dillaracademy/"
              target="_blank"
              rel="noreferrer noopener"
            >
              {t("instagram")}: @dillaracademy
            </a>

            <Link href="/contact" className="underline">
              {t("contact_text")}
            </Link>
          </div>
        </div>

        <div className="flex w-full justify-center lg:w-auto lg:justify-end">
          <Link
            href="/donate"
            className="inline-flex min-w-[180px] items-center justify-center rounded-lg bg-white px-8 py-4 text-lg font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
          >
            Donate
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;