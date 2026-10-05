import Link from "next/link";
import BackLink from "@/components/form-cues/back-link";
import { FORM_CUE_IDS, FORM_CUE_TITLES, isFormCueId } from "@/components/form-cues/cue-ids";

export const metadata = { title: "Form cues" };

export default function FormIndexPage() {
  return (
    <div className="flex flex-col">
      <header className="page-top px-3 flex flex-col gap-4">
        <BackLink aria-label="Back" className="btn-round">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </BackLink>
        <div className="px-2 flex flex-col gap-1.5">
          <span className="eyebrow">3D, from your PT</span>
          <h1 className="page-title">Form cues</h1>
        </div>
      </header>
      <ul className="card-group m-0 mx-3 mt-5 p-0 list-none">
        {FORM_CUE_IDS.filter(isFormCueId).map((id) => (
          <li key={id} className="border-b border-line last:border-b-0">
            <Link href={`/form/${id}`} className="press-soft flex items-center gap-3 px-4 py-3.5">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-[rgba(142,59,94,.12)] text-info flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
                </svg>
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="num text-[22px]">{FORM_CUE_TITLES[id].title}</span>
                <span className="text-[13px] text-muted">{FORM_CUE_TITLES[id].blurb}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint shrink-0">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
