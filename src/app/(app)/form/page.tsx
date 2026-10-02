import Link from "next/link";
import BackLink from "@/components/form-cues/back-link";
import { FORM_CUE_IDS, FORM_CUE_TITLES, isFormCueId } from "@/components/form-cues/cue-ids";

export const metadata = { title: "Form cues" };

export default function FormIndexPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col pb-8">
      <header className="px-4 pb-2 flex flex-col gap-1 pt-[max(52px,calc(env(safe-area-inset-top)_+_8px))]">
        <div className="-ml-1">
          <BackLink
            aria-label="Back"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-fg hover:bg-surface"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </BackLink>
        </div>
        <h1 className="px-1 font-display font-bold text-[44px] leading-none">Form cues</h1>
      </header>
      <ul className="mx-4 mt-4 flex flex-col gap-2">
        {FORM_CUE_IDS.filter(isFormCueId).map((id) => (
          <li key={id}>
            <Link
              href={`/form/${id}`}
              className="flex items-center gap-3 p-4 rounded-[14px] bg-surface border border-line hover:bg-surface-2"
            >
              <span className="w-10 h-10 shrink-0 rounded-full bg-surface-2 flex items-center justify-center text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 5l11 7-11 7z" />
                </svg>
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-display font-bold text-[22px] leading-tight">{FORM_CUE_TITLES[id].title}</span>
                <span className="text-[13px] text-muted">{FORM_CUE_TITLES[id].blurb}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint shrink-0">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
