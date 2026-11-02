"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet } from "@/components/session/sheet";
import { cn } from "@/lib/utils";
import { dayTotals, forGrams, MEALS, type Meal } from "@/domain/nutrition";
import type { FoodSummary } from "@/server/food/foods";
import type { TextDraft } from "@/server/food/log-text";
import {
  barcodeAction,
  draftTextAction,
  foodDetailAction,
  logItemsAction,
  quickFoodsAction,
  searchFoodsAction,
} from "@/app/(app)/food/actions";

type Tab = "describe" | "search" | "barcode";

interface BasketItem {
  key: string;
  food: FoodSummary;
  grams: number;
  portions: Array<{ label: string; grams: number }>;
  /** From the text parser. */
  said?: string;
  estGrams?: number;
  confidence?: number;
  basis?: string;
  alternatives?: FoodSummary[];
}

const SOURCE_SHORT: Record<string, string> = {
  user: "Mine",
  recipe: "Recipe",
  indb: "INDB",
  usda_foundation: "USDA",
  usda_sr: "USDA",
  off: "OFF",
};

const per100 = (f: FoodSummary) => ({ kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fibre: f.fibre100g });
const isCollagen = (f: FoodSummary) => /\bcollagen\b/i.test(f.name);

let seq = 0;
const newKey = () => `b${++seq}`;

export function LogSheet({
  open,
  onClose,
  date,
  isToday,
  defaultMeal,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  isToday: boolean;
  defaultMeal: Meal;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("describe");
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [time, setTime] = useState("13:00");
  const [draftMeta, setDraftMeta] = useState<{ text: string; model: string; cost: number | null } | null>(null);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (open) setMeal(defaultMeal);
  }, [open, defaultMeal]);

  const reset = () => {
    setBasket([]);
    setDraftMeta(null);
    setTab("describe");
  };

  const add = async (food: FoodSummary, grams?: number) => {
    const key = newKey();
    const g = grams ?? food.servingG ?? 100;
    setBasket((b) => [...b, { key, food, grams: g, portions: [] }]);
    const r = await foodDetailAction(food.id);
    if (r.ok) setBasket((b) => b.map((i) => (i.key === key ? { ...i, portions: r.data.portions } : i)));
  };

  const fromDraft = (d: TextDraft, text: string) => {
    const items: BasketItem[] = d.items
      .filter((i) => i.match)
      .map((i) => ({
        key: newKey(),
        food: i.match!,
        grams: i.grams,
        portions: i.match!.portions,
        said: i.said,
        estGrams: i.estGrams,
        confidence: i.confidence,
        basis: i.basis,
        alternatives: i.alternatives,
      }));
    const missed = d.items.filter((i) => !i.match).map((i) => i.said);
    setBasket((b) => [...b, ...items]);
    setDraftMeta({ text, model: d.model, cost: d.costUsd });
    if (missed.length) toast.warning(`No match for ${missed.join(", ")}. Search for ${missed.length > 1 ? "them" : "it"} instead.`);
  };

  const totals = useMemo(
    () =>
      dayTotals(
        basket.map((i) => ({ ...forGrams(per100(i.food), i.grams), countsToProtein: !isCollagen(i.food) }))
      ),
    [basket]
  );

  const save = () =>
    startSave(async () => {
      const r = await logItemsAction({
        meal,
        ...(isToday ? {} : { date, time }),
        inputMode: draftMeta ? "text" : basket.length === 1 && tab === "barcode" ? "barcode" : "search",
        rawText: draftMeta?.text ?? null,
        model: draftMeta?.model ?? null,
        costUsd: draftMeta?.cost ?? null,
        items: basket.map((i) => ({ foodId: i.food.id, grams: i.grams, estGrams: i.estGrams ?? null, confidence: i.confidence ?? null })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Logged ${Math.round(totals.kcal)} kcal, ${Math.round(totals.proteinCounted)} g protein`);
      reset();
      onClose();
      router.refresh();
    });

  return (
    <Sheet open={open} onClose={onClose} label="Log food" variant="full">
      <div className="flex flex-col h-full max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button type="button" onClick={onClose} className="h-11 px-2 text-fg-2 text-[15px]">
            Cancel
          </button>
          <span className="font-semibold">Log food</span>
          <button
            type="button"
            onClick={save}
            disabled={!basket.length || saving}
            className="h-11 px-4 rounded-full bg-accent text-accent-ink font-semibold disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="flex gap-1.5 px-4 pb-3" role="tablist">
          {(["describe", "search", "barcode"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 h-10 rounded-full text-[14px] font-medium capitalize",
                tab === t ? "bg-fg text-bg" : "bg-surface-2 text-fg-2"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {tab === "describe" && <DescribeTab onDraft={fromDraft} />}
          {tab === "search" && <SearchTab onPick={(f) => add(f)} />}
          {tab === "barcode" && <BarcodeTab onFound={(f) => add(f)} />}

          {basket.length > 0 && (
            <section className="mt-5">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="section-label m-0">Check and save</h2>
                <span className="text-[13px] text-muted num">
                  {Math.round(totals.kcal)} kcal · <span className="text-fg">{Math.round(totals.proteinCounted)} g protein</span>
                </span>
              </div>
              <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                {basket.map((i) => (
                  <BasketRow
                    key={i.key}
                    item={i}
                    onChange={(patch) => setBasket((b) => b.map((x) => (x.key === i.key ? { ...x, ...patch } : x)))}
                    onRemove={() => setBasket((b) => b.filter((x) => x.key !== i.key))}
                  />
                ))}
              </ul>
              {totals.proteinExcluded > 0 && (
                <p className="text-[12px] text-muted mt-2 mb-0">
                  {totals.proteinExcluded} g collagen protein isn&apos;t counted toward your protein target.
                </p>
              )}
              <div className="flex gap-2 mt-4 items-center">
                <label className="text-[13px] text-muted" htmlFor="meal">
                  Meal
                </label>
                <select
                  id="meal"
                  value={meal}
                  onChange={(e) => setMeal(e.target.value as Meal)}
                  className="h-10 px-3 rounded-[10px] bg-surface-2 text-fg capitalize"
                >
                  {MEALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {!isToday && (
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    aria-label="Time eaten"
                    className="h-10 px-3 rounded-[10px] bg-surface-2 text-fg"
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function BasketRow({
  item,
  onChange,
  onRemove,
}: {
  item: BasketItem;
  onChange: (patch: Partial<BasketItem>) => void;
  onRemove: () => void;
}) {
  const [swapping, setSwapping] = useState(false);
  const m = forGrams(per100(item.food), item.grams);
  const max = Math.max(500, Math.ceil((item.grams * 3) / 50) * 50);
  const lowConfidence = item.confidence != null && item.confidence < 0.6;
  return (
    <li className="card p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {item.said && item.said.toLowerCase() !== item.food.name.toLowerCase() && (
            <div className="text-[12px] text-muted truncate">&ldquo;{item.said}&rdquo;</div>
          )}
          <div className="text-[15px] leading-snug">
            {item.food.name}
            {item.food.brand ? <span className="text-muted"> · {item.food.brand}</span> : null}
          </div>
          <div className="text-[12px] text-muted flex gap-1.5 flex-wrap mt-0.5">
            <span className="px-1.5 rounded bg-surface-3">{SOURCE_SHORT[item.food.source] ?? item.food.source}</span>
            {!item.food.verified && <span className="text-danger-text">unverified</span>}
            {item.basis && <span>grams: {item.basis === "estimate" ? "estimated" : item.basis}</span>}
            {lowConfidence && <span className="text-danger-text">check the amount</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="num text-[15px]">{Math.round(m.protein)} g</div>
          <div className="num text-[12px] text-muted">{Math.round(m.kcal)} kcal</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={5000}
          value={item.grams}
          onChange={(e) => onChange({ grams: Math.max(0, Number(e.target.value) || 0) })}
          aria-label={`Grams of ${item.food.name}`}
          className="w-20 h-10 px-2 rounded-[10px] bg-surface-2 text-fg num text-right"
        />
        <span className="text-[13px] text-muted">g</span>
        <input
          type="range"
          min={0}
          max={max}
          step={5}
          value={Math.min(item.grams, max)}
          onChange={(e) => onChange({ grams: Number(e.target.value) })}
          aria-label={`Adjust grams of ${item.food.name}`}
          className="flex-1 accent-[rgb(var(--coral))]"
        />
      </div>

      {item.portions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {item.portions.slice(0, 5).map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ grams: p.grams })}
              className="h-8 px-2.5 rounded-full bg-surface-2 text-[12px] text-fg-2"
            >
              {p.label} · {Math.round(p.grams)} g
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 text-[13px]">
        {item.alternatives && item.alternatives.length > 0 && (
          <button type="button" onClick={() => setSwapping((s) => !s)} className="text-fg-2 underline underline-offset-2">
            {swapping ? "Keep this" : "Not this?"}
          </button>
        )}
        <button type="button" onClick={onRemove} className="text-danger-soft ml-auto">
          Remove
        </button>
      </div>
      {swapping && item.alternatives && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {item.alternatives.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ food: a, alternatives: [item.food, ...item.alternatives!.filter((x) => x.id !== a.id)], basis: undefined });
                  setSwapping(false);
                  foodDetailAction(a.id).then((r) => r.ok && onChange({ portions: r.data.portions }));
                }}
                className="w-full text-left px-3 py-2 rounded-[10px] bg-surface-2 text-[14px]"
              >
                {a.name} <span className="text-muted text-[12px]">· {SOURCE_SHORT[a.source]} · {Math.round(a.kcal100g)} kcal/100 g</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DescribeTab({ onDraft }: { onDraft: (d: TextDraft, text: string) => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await draftTextAction(text);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          onDraft(r.data, text);
          setText("");
        });
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="2 rotis, dal, 150 g chicken tikka, coffee with milk"
        className="w-full p-3 rounded-[14px] bg-surface-2 text-fg text-[16px] resize-none"
      />
      <button
        type="submit"
        disabled={pending || text.trim().length < 2}
        className="h-11 rounded-full bg-surface-3 text-fg font-medium disabled:opacity-40"
      >
        {pending ? "Reading…" : "Find foods"}
      </button>
      <p className="m-0 text-[12px] text-muted">
        Calories and protein come from the food database, not the AI. It only reads what you ate and estimates grams; check them below.
      </p>
    </form>
  );
}

function FoodList({ foods, onPick }: { foods: FoodSummary[]; onPick: (f: FoodSummary) => void }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col">
      {foods.map((f) => (
        <li key={f.id}>
          <button type="button" onClick={() => onPick(f)} className="w-full text-left py-2.5 border-b border-line flex gap-2 items-center">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] leading-snug">
                {f.name}
                {f.brand ? <span className="text-muted"> · {f.brand}</span> : null}
              </span>
              <span className="block text-[12px] text-muted">
                {SOURCE_SHORT[f.source]} · {Math.round(f.kcal100g)} kcal · {f.protein100g != null ? `${Math.round(f.protein100g)} g protein` : "protein ?"} per 100 g
                {f.favourite ? " · ★" : ""}
              </span>
            </span>
            <span className="text-[22px] text-fg-2" aria-hidden>
              +
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchTab({ onPick }: { onPick: (f: FoodSummary) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSummary[]>([]);
  const [quick, setQuick] = useState<{ recent: FoodSummary[]; favourites: FoodSummary[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    quickFoodsAction().then((r) => r.ok && setQuick(r.data));
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const id = ++latest.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchFoodsAction(term);
      if (id !== latest.current) return;
      setLoading(false);
      if (r.ok) setResults(r.data);
      else toast.error(r.error);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search foods, recipes, brands"
        className="h-11 px-3 rounded-[12px] bg-surface-2 text-fg text-[16px]"
      />
      {q.trim().length >= 2 ? (
        loading && !results.length ? (
          <p className="text-muted text-[14px] m-0">Searching…</p>
        ) : results.length ? (
          <FoodList foods={results} onPick={onPick} />
        ) : (
          <p className="text-muted text-[14px] m-0">No matches. Try another name, or add it as your own food.</p>
        )
      ) : (
        <>
          {quick?.favourites.length ? (
            <section>
              <h3 className="section-label mb-1">Favourites</h3>
              <FoodList foods={quick.favourites} onPick={onPick} />
            </section>
          ) : null}
          {quick?.recent.length ? (
            <section>
              <h3 className="section-label mb-1">Recent</h3>
              <FoodList foods={quick.recent} onPick={onPick} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function BarcodeTab({ onFound }: { onFound: (f: FoodSummary) => void }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await barcodeAction(code);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          onFound(r.data);
          setCode("");
        });
      }}
    >
      <input
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="Barcode number (EAN / UPC)"
        className="h-11 px-3 rounded-[12px] bg-surface-2 text-fg text-[16px] num"
      />
      <button type="submit" disabled={pending || code.length < 8} className="h-11 rounded-full bg-surface-3 text-fg font-medium disabled:opacity-40">
        {pending ? "Looking up…" : "Look up"}
      </button>
      <p className="m-0 text-[12px] text-muted">
        Looked up on Open Food Facts, which covers Indian and UAE packaged foods. Camera scanning comes with the iPhone app.
      </p>
    </form>
  );
}
