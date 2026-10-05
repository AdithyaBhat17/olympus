"use client";

import dynamic from "next/dynamic";

/**
 * The viewer (engine + defs) is code-split from the route, and three.js is a
 * further dynamic import inside the engine, so nothing 3D lands in the app
 * shell. The skeleton matches the stage so nothing jumps.
 */
const FormViewerLazy = dynamic(() => import("./form-viewer"), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" className="page-top px-3">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-surface-2" />
        <span className="flex flex-col gap-1.5">
          <span className="h-3 w-40 rounded bg-surface-2" />
          <span className="h-7 w-52 rounded-lg bg-surface-2" />
        </span>
      </div>
      <div className="mt-3.5 rounded-[28px] bg-surface aspect-[366/392]" />
    </div>
  ),
});

export default FormViewerLazy;
