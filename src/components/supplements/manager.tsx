"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet } from "@/components/session/sheet";
import { cn } from "@/lib/utils";
import { MARKERS, SLOTS, suggestTags } from "@/domain/supplements";
import type { StackItem } from "@/server/supplements";
import type { FoodSummary } from "@/server/food/foods";
import type { SupplementSlot } from "@/lib/db/schema";
import { searchFoodsAction } from "@/app/(app)/food/actions";
import {
  addAppointmentAction,
  addLabResultAction,
  archiveSupplementAction,
  inventoryAction,
  saveSupplementAction,
} from "@/app/(app)/supplements/actions";

const input = "h-11 px-3 rounded-[10px] bg-surface-2 text-fg text-[16px] w-full";
const small = "h-9 px-3 rounded-[10px] bg-surface-2 text-[13px] text-fg-2";
const label = "flex flex-col gap-1 text-[13px] text-muted";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TAGS = ["levothyroxine", "calcium", "iron", "magnesium", "multivitamin", "biotin", "soy", "vitamin_d", "selenium", "creatine", "protein", "collagen"];

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error((r as { error: string }).error);
      if (ok) toast.success(ok);
      done?.();
      router.refresh();
    });
  return { pending, go };
}

function Header({ title, onCancel, onSave, disabled, saving }: { title: string; onCancel: () => void; onSave: () => void; disabled?: boolean; saving: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <button type="button" onClick={onCancel} className="h-11 px-2 text-fg-2">Cancel</button>
      <span className="font-semibold">{title}</span>
      <button type="button" onClick={onSave} disabled={disabled || saving} className="h-11 px-4 rounded-full bg-accent text-accent-ink font-semibold disabled:opacity-40">
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function FoodPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (f: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<FoodSummary[]>([]);
  const latest = useRef(0);
  useEffect(() => {
    if (q.trim().length < 2) return setRes([]);
    const id = ++latest.current;
    const t = setTimeout(async () => {
      const r = await searchFoodsAction(q);
      if (id === latest.current && r.ok) setRes(r.data.slice(0, 6));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <div className="flex items-center gap-2 text-[14px]">
        <span className="flex-1 truncate">{value.name}</span>
        <button type="button" className={small} onClick={() => onChange(null)}>Remove</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your foods (e.g. the whey you added from its label)" className={input} />
      {res.map((f) => (
        <button key={f.id} type="button" onClick={() => { onChange({ id: f.id, name: f.name }); setQ(""); }} className="text-left px-3 py-2 rounded-[10px] bg-surface-2 text-[14px]">
          {f.name} <span className="text-muted text-[12px]">· {Math.round(f.kcal100g)} kcal/100 g</span>
        </button>
      ))}
    </div>
  );
}

export function StackEditor({ existing }: { existing?: StackItem }) {
  const [open, setOpen] = useState(false);
  const { pending, go } = useSave();
  const [f, setF] = useState(() => ({
    name: existing?.name ?? "",
    brand: existing?.brand ?? "",
    servingDesc: existing?.servingDesc ?? "1 tablet",
    servingsPerDose: String(existing?.servingsPerDose ?? 1),
    servingsPerContainer: existing?.servingsPerContainer ? String(existing.servingsPerContainer) : "",
    slot: (existing?.slot ?? "breakfast") as SupplementSlot,
    activeDays: existing?.activeDays ?? ([] as number[]),
    tags: existing?.tags ?? ([] as string[]),
    markers: existing?.markers ?? ([] as string[]),
    food: existing?.foodId ? { id: existing.foodId, name: "Linked food" } : (null as { id: string; name: string } | null),
    foodGrams: existing?.foodGramsPerServing ? String(existing.foodGramsPerServing) : "",
    buyUae: existing?.whereToBuy.find((w) => w.region === "UAE")?.note ?? "",
    buyIndia: existing?.whereToBuy.find((w) => w.region === "India")?.note ?? "",
    notes: existing?.notes ?? "",
  }));
  const toggle = <K extends "activeDays" | "tags" | "markers">(k: K, v: (typeof f)[K][number]) =>
    setF({ ...f, [k]: (f[k] as unknown[]).includes(v) ? (f[k] as unknown[]).filter((x) => x !== v) : [...(f[k] as unknown[]), v] });
  const save = () =>
    go(
      () =>
        saveSupplementAction(existing?.id ?? null, {
          name: f.name,
          brand: f.brand || null,
          servingDesc: f.servingDesc,
          servingsPerDose: Number(f.servingsPerDose) || 1,
          servingsPerContainer: Number(f.servingsPerContainer) || null,
          slot: f.slot,
          activeDays: f.activeDays,
          tags: f.tags,
          markers: f.markers,
          foodId: f.food?.id ?? null,
          foodGramsPerServing: Number(f.foodGrams) || null,
          whereToBuy: [
            ...(f.buyUae ? [{ region: "UAE", note: f.buyUae }] : []),
            ...(f.buyIndia ? [{ region: "India", note: f.buyIndia }] : []),
          ],
          notes: f.notes || null,
        }),
      () => setOpen(false),
      existing ? "Saved" : `Added ${f.name}`
    );
  const chip = (on: boolean) => cn("h-8 px-2.5 rounded-full text-[12px]", on ? "bg-fg text-bg" : "bg-surface-2 text-fg-2");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={small}>
        {existing ? "Edit" : "Add"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label={existing ? `Edit ${existing.name}` : "Add supplement"} variant="full">
        <div className="max-w-lg mx-auto w-full h-full flex flex-col">
          <Header title={existing ? "Edit" : "Add supplement"} onCancel={() => setOpen(false)} onSave={save} disabled={!f.name.trim()} saving={pending} />
          <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-3">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name (e.g. Thyronorm)" className={input} />
            <input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} placeholder="Brand (optional)" className={input} />
            <div className="grid grid-cols-3 gap-2">
              <label className={cn(label, "col-span-1")}>Per dose<input type="number" inputMode="decimal" value={f.servingsPerDose} onChange={(e) => setF({ ...f, servingsPerDose: e.target.value })} className={input} /></label>
              <label className={cn(label, "col-span-2")}>Serving<input value={f.servingDesc} onChange={(e) => setF({ ...f, servingDesc: e.target.value })} className={input} /></label>
            </div>
            <label className={label}>Servings per container<input type="number" inputMode="numeric" value={f.servingsPerContainer} onChange={(e) => setF({ ...f, servingsPerContainer: e.target.value })} className={input} /></label>
            <div className={label}>
              When
              <div className="flex flex-wrap gap-1.5">
                {SLOTS.map((s) => (
                  <button key={s.slot} type="button" className={chip(f.slot === s.slot)} onClick={() => setF({ ...f, slot: s.slot })}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className={label}>
              Days (none = every day)
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" className={chip(f.activeDays.includes(i))} onClick={() => toggle("activeDays", i)}>{d}</button>
                ))}
              </div>
            </div>
            <div className={label}>
              What it contains
              <span className="text-[12px]">Timing warnings (like thyroid medicine and coffee or calcium) only work when this is set.</span>
              {suggestTags(f.name).some((t) => !f.tags.includes(t)) && (
                <button
                  type="button"
                  className={small}
                  onClick={() => setF({ ...f, tags: [...new Set([...f.tags, ...suggestTags(f.name)])] })}
                >
                  Add suggested: {suggestTags(f.name).filter((t) => !f.tags.includes(t)).map((t) => t.replace("_", " ")).join(", ")}
                </button>
              )}
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((t) => (
                  <button key={t} type="button" className={chip(f.tags.includes(t))} onClick={() => toggle("tags", t)}>{t.replace("_", " ")}</button>
                ))}
              </div>
            </div>
            <div className={label}>
              Related lab tests
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(MARKERS).map(([k, m]) => (
                  <button key={k} type="button" className={chip(f.markers.includes(k))} onClick={() => toggle("markers", k)}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className={label}>
              Logs food too (whey, collagen)
              <FoodPicker value={f.food} onChange={(food) => setF({ ...f, food })} />
              {f.food && <input type="number" inputMode="decimal" value={f.foodGrams} onChange={(e) => setF({ ...f, foodGrams: e.target.value })} placeholder="grams per serving (e.g. 31)" className={input} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Buy in UAE<input value={f.buyUae} onChange={(e) => setF({ ...f, buyUae: e.target.value })} placeholder="where" className={input} /></label>
              <label className={label}>Buy in India<input value={f.buyIndia} onChange={(e) => setF({ ...f, buyIndia: e.target.value })} placeholder="where" className={input} /></label>
            </div>
            <label className={label}>Notes<input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={input} /></label>
            {existing && (
              <button type="button" className={cn(small, "self-start text-danger-soft")} onClick={() => go(() => archiveSupplementAction(existing.id), () => setOpen(false), "Removed")}>
                Remove from stack
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}

export function InventoryButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [servings, setServings] = useState("");
  const [kind, setKind] = useState<"restock" | "count">("restock");
  const [region, setRegion] = useState("UAE");
  const { pending, go } = useSave();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={small}>Stock</button>
      <Sheet open={open} onClose={() => setOpen(false)} label={`Stock for ${name}`}>
        <div className="p-4 flex flex-col gap-3 max-w-lg mx-auto w-full">
          <h3 className="m-0 font-semibold">{name}</h3>
          <div className="flex gap-1.5">
            {(["restock", "count"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("flex-1 h-10 rounded-full text-[14px]", kind === k ? "bg-fg text-bg" : "bg-surface-2 text-fg-2")}>
                {k === "restock" ? "Bought more" : "Counted what's left"}
              </button>
            ))}
          </div>
          <label className={label}>Servings<input type="number" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} className={input} /></label>
          {kind === "restock" && (
            <label className={label}>Bought in<select value={region} onChange={(e) => setRegion(e.target.value)} className={input}><option>UAE</option><option>India</option><option>Other</option></select></label>
          )}
          <button
            type="button"
            disabled={pending || servings === ""}
            onClick={() => go(() => inventoryAction(id, Number(servings), kind, kind === "restock" ? region : undefined), () => { setOpen(false); setServings(""); }, "Stock updated")}
            className="h-11 rounded-full bg-accent text-accent-ink font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function LabsEditor() {
  const [open, setOpen] = useState(false);
  const { pending, go } = useSave();
  const [r, setR] = useState({ marker: "TSH", drawnOn: "", value: "", refLow: "", refHigh: "" });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={small}>Add result</button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Add lab result">
        <div className="p-4 flex flex-col gap-3 max-w-lg mx-auto w-full">
          <label className={label}>Test<select value={r.marker} onChange={(e) => setR({ ...r, marker: e.target.value })} className={input}>{Object.entries(MARKERS).map(([k, m]) => <option key={k} value={k}>{m.label} ({m.unit})</option>)}</select></label>
          <label className={label}>Date<input type="date" value={r.drawnOn} onChange={(e) => setR({ ...r, drawnOn: e.target.value })} className={input} /></label>
          <label className={label}>Result ({MARKERS[r.marker].unit})<input type="number" inputMode="decimal" value={r.value} onChange={(e) => setR({ ...r, value: e.target.value })} className={input} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Lab range low<input type="number" inputMode="decimal" value={r.refLow} onChange={(e) => setR({ ...r, refLow: e.target.value })} className={input} /></label>
            <label className={label}>Lab range high<input type="number" inputMode="decimal" value={r.refHigh} onChange={(e) => setR({ ...r, refHigh: e.target.value })} className={input} /></label>
          </div>
          <button
            type="button"
            disabled={pending || !r.drawnOn || r.value === ""}
            onClick={() =>
              go(
                () => addLabResultAction({ marker: r.marker, drawnOn: r.drawnOn, value: Number(r.value), refLow: r.refLow ? Number(r.refLow) : null, refHigh: r.refHigh ? Number(r.refHigh) : null }),
                () => { setOpen(false); setR({ ...r, value: "", refLow: "", refHigh: "" }); },
                "Result saved"
              )
            }
            className="h-11 rounded-full bg-accent text-accent-ink font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function AppointmentEditor({ markers }: { markers: Array<{ key: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const { pending, go } = useSave();
  const [a, setA] = useState({ date: "", time: "08:00", markers: ["TSH", "FT4"] as string[], fasting: false, med: "" });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={small}>Schedule</button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Schedule a blood test" variant="full">
        <div className="max-w-lg mx-auto w-full h-full flex flex-col">
          <Header
            title="Blood test"
            onCancel={() => setOpen(false)}
            saving={pending}
            disabled={!a.date || !a.markers.length}
            onSave={() => go(() => addAppointmentAction({ date: a.date, time: a.time, markers: a.markers, fasting: a.fasting, thyroidMedInstruction: a.med }), () => setOpen(false), "Scheduled")}
          />
          <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Date<input type="date" value={a.date} onChange={(e) => setA({ ...a, date: e.target.value })} className={input} /></label>
              <label className={label}>Time<input type="time" value={a.time} onChange={(e) => setA({ ...a, time: e.target.value })} className={input} /></label>
            </div>
            <div className={label}>
              Tests
              <div className="flex flex-wrap gap-1.5">
                {markers.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setA({ ...a, markers: a.markers.includes(m.key) ? a.markers.filter((x) => x !== m.key) : [...a.markers, m.key] })}
                    className={cn("h-8 px-2.5 rounded-full text-[12px]", a.markers.includes(m.key) ? "bg-fg text-bg" : "bg-surface-2 text-fg-2")}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={a.fasting} onChange={(e) => setA({ ...a, fasting: e.target.checked })} /> Fasting test</label>
            <label className={label}>
              Your doctor&apos;s instruction for the thyroid dose on test day
              <input value={a.med} onChange={(e) => setA({ ...a, med: e.target.value })} placeholder="e.g. take it after the blood draw" className={input} />
            </label>
          </div>
        </div>
      </Sheet>
    </>
  );
}
