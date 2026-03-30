import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  MessageCircle,
  Download,
  Map as MapIcon,
  Printer,
} from 'lucide-react';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: 'About — Bike Chatt',
  description:
    'About the Bike Chatt project — a free interactive map of Chattanooga bike routes, trails, and resources.',
};

const LOGO_DOWNLOADS = [
  {
    label: 'Primary (color)',
    file: '/Bike-Chatt_Logo-blue-text-green.svg',
    bg: 'bg-white',
  },
  {
    label: 'White text',
    file: '/Bike-Chatt_Logo-white-text.svg',
    bg: 'bg-[#1a434e]',
  },
  {
    label: 'Black text',
    file: '/Bike-Chatt_Logo-black-text.svg',
    bg: 'bg-white',
  },
] as const;

const ICON_DOWNLOADS = [
  {
    label: 'Blue/green',
    file: '/Bike-Chatt_Logo-primary-blue-green.svg',
    bg: 'bg-white',
  },
  {
    label: 'White',
    file: '/Bike-Chatt_Logo-white.svg',
    bg: 'bg-[#1a434e]',
  },
  {
    label: 'Black',
    file: '/Bike-Chatt_Logo-black.svg',
    bg: 'bg-white',
  },
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50 fixed inset-0 overflow-y-auto z-[9999]">
      {/* Header bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#1a434e] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to map
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-12">
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-14">
          <Image
            src="/Bike-Chatt_Logo-blue-text-green.svg"
            alt="Bike Chatt logo"
            width={224}
            height={210}
            className="w-56 mb-6"
            priority
          />
          <p className="text-gray-600 text-lg leading-relaxed max-w-md">
            A free, open-source interactive map of Chattanooga bike routes,
            mountain bike trails, and cycling resources — built by the local
            riding community.
          </p>
        </div>

        {/* Links */}
        <section className="grid sm:grid-cols-2 gap-3 mb-14">
          <ExtLink
            href="https://github.com/kwiens/bikemap"
            icon={<GithubIcon className="w-5 h-5" />}
            title="Source on GitHub"
            desc="View the code, open issues, or contribute"
          />
          <ExtLink
            href="https://github.com/kwiens/bikemap/issues"
            icon={<MessageCircle className="w-5 h-5" />}
            title="Send feedback"
            desc="Report a bug or suggest a feature"
          />
        </section>

        {/* Downloads */}
        <section className="mb-14">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
            Downloads
          </h2>

          <Link
            href="/export"
            className="flex items-center gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-[#c3f44d] hover:shadow-sm transition-all group mb-3"
          >
            <div className="w-10 h-10 rounded-lg bg-[#1a434e] flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 text-[#c3f44d]" />
            </div>
            <div>
              <p className="font-medium text-gray-900 group-hover:text-[#1a434e]">
                Print map & route files
              </p>
              <p className="text-sm text-gray-500">
                Download routes as GPX or SVG
              </p>
            </div>
            <MapIcon className="w-4 h-4 text-gray-300 ml-auto" />
          </Link>
        </section>

        {/* Logo downloads */}
        <section className="mb-14">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
            Logo & stickers
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Use these for stickers, flyers, or anything that helps people find
            safe rides in Chattanooga.
          </p>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Stickers
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <LogoCard
              label="Logo sticker"
              file="/Bike-Chatt_Logo_Sticker.svg"
              bg="bg-white"
            />
            <LogoCard
              label="QR sticker"
              file="/Bike-Chatt_QR_Sticker.svg"
              bg="bg-white"
            />
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Full logo
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {LOGO_DOWNLOADS.map((logo) => (
              <LogoCard key={logo.file} {...logo} />
            ))}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Icon only
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {ICON_DOWNLOADS.map((icon) => (
              <LogoCard key={icon.file} {...icon} square />
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 pt-8 pb-12 text-center text-sm text-gray-400">
          <p>
            Made in Chattanooga.{' '}
            <a
              href="https://github.com/kwiens/bikemap/blob/main/LICENSE"
              className="underline hover:text-gray-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT License
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function ExtLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-[#c3f44d] hover:shadow-sm transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-[#1a434e] flex items-center justify-center shrink-0">
        <span className="text-[#c3f44d]">{icon}</span>
      </div>
      <div>
        <p className="font-medium text-gray-900 group-hover:text-[#1a434e]">
          {title}
        </p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
    </a>
  );
}

function LogoCard({
  label,
  file,
  bg,
  square,
}: {
  label: string;
  file: string;
  bg: string;
  square?: boolean;
}) {
  return (
    <div className="group">
      <div
        className={`${bg} rounded-lg border border-gray-200 flex items-center justify-center p-4 mb-2 aspect-[4/3] ${square ? 'aspect-square' : ''}`}
      >
        <Image
          src={file}
          alt={`Bike Chatt ${label}`}
          width={square ? 64 : 200}
          height={64}
          className={square ? 'w-16 h-16' : 'w-full max-h-16'}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <a
          href={file}
          download
          className="text-xs text-gray-400 hover:text-[#1a434e] flex items-center gap-1 transition-colors"
        >
          <Download className="w-3 h-3" />
          SVG
        </a>
      </div>
    </div>
  );
}
