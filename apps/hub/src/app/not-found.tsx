import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center above-grain">
        <div className="mx-auto max-w-[44ch] px-6 py-20 text-center">
          <Image
            src="/art/empty-nothing-captured.png"
            alt=""
            aria-hidden
            width={1400}
            height={933}
            className="mx-auto mb-8 w-full max-w-sm opacity-90"
          />
          <h1 className="display text-head">Nothing pinned here</h1>
          <p className="mt-3 text-body leading-relaxed text-ink-muted">
            That app, feature or persona isn&apos;t in the registry.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-sm border border-rule bg-paper-raised px-3 py-1.5 text-label font-medium text-ink shadow-plate transition-colors hover:border-rule-strong hover:bg-paper-sunken"
          >
            Back to the library
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
