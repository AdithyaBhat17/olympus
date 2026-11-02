"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet } from "@/components/session/sheet";
import { recipePer100 } from "@/domain/nutrition";
import type { FoodSummary } from "@/server/food/foods";
import { archiveFoodAction, createUserFoodAction, saveRecipeAction, searchFoodsAction } from "@/app/(app)/food/actions";

const input = "h-11 px-3 rounded-[10px] bg-surface-2 text-fg text-[16px] w-full";
const btn = "h-11 px-4 rounded-full font-semibold disabled:opacity-40";

export function MyFoods({ foods }: { foods: FoodSummary[] }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"recipe" | "food" | null>(null);
  const [pending, start] = useTransition();
  const recipes = foods.filter((f) => f.source === "recipe");
  const own = foods.filter((f) => f.source === "user");
  const archive = (f: FoodSummary) =>
    start(async () => {
      if (!confirm(`Remove ${f.name}? Past logs keep their numbers.`)) return;
      const r = await archiveFoodAction(f.id);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  const List = ({ items, empty }: { items: FoodSummary[]; empty: string }) =>
    items.length ? (
      <ul className="m-0 p-0 list-none">
        {items.map((f) => (
          <li key={f.id} className="py-2.5 border-b border-line last:border-0 flex gap-2 items-center">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] truncate">{f.name}</span>
              <span className="block text-[12px] text-muted num">
                {Math.round(f.kcal100g)} kcal · {Math.round(f.protein100g ?? 0)} g protein per 100 g
                {f.servingLabel && f.servingG ? ` · ${f.servingLabel} = ${Math.round(f.servingG)} g` : ""}
              </span>
            </span>
            <button type="button" disabled={pending} onClick={() => archive(f)} className="text-[13px] text-danger-soft px-2 h-9">
              Remove
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[14px] text-muted m-0 py-2">{empty}</p>
    );

  return (
    <div className="flex flex-col gap-3 mt-3">
      <div className="flex gap-2 mx-3">
        <button type="button" onClick={() => setSheet("recipe")} className={`${btn} flex-1 bg-accent text-accent-ink`}>
          New recipe
        </button>
        <button type="button" onClick={() => setSheet("food")} className={`${btn} flex-1 bg-surface-2 text-fg`}>
          Food from a label
        </button>
      </div>
      <section className="card mx-3 px-4 py-3">
        <h2 className="section-label m-0 mb-1">Recipes</h2>
        <List items={recipes} empty="Weigh the ingredients once (your dal, your poha) and log it by the katori from then on." />
      </section>
      <section className="card mx-3 px-4 py-3">
        <h2 className="section-label m-0 mb-1">Foods</h2>
        <List items={own} empty="Packaged foods without a barcode match, from their nutrition label." />
      </section>
      <Sheet open={sheet === "recipe"} onClose={() => setSheet(null)} label="New recipe" variant="full">
        <RecipeBuilder onDone={() => { setSheet(null); router.refresh(); }} onCancel={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "food"} onClose={() => setSheet(null)} label="Food from a label" variant="full">
        <LabelFood onDone={() => { setSheet(null); router.refresh(); }} onCancel={() => setSheet(null)} />
      </Sheet>
    </div>
  );
}

interface Ing {
  food: FoodSummary;
  grams: number;
}

function IngredientSearch({ onPick }: { onPick: (f: FoodSummary) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSummary[]>([]);
  const latest = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const id = ++latest.current;
    const t = setTimeout(async () => {
      const r = await searchFoodsAction(term);
      if (id === latest.current && r.ok) setResults(r.data.slice(0, 8));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="flex flex-col gap-1">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add an ingredient (toor dal raw, ghee, onion…)" className={input} />
      {results.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => { onPick(f); setQ(""); setResults([]); }}
          className="text-left px-3 py-2 rounded-[10px] bg-surface-2 text-[14px]"
        >
          {f.name} <span className="text-muted text-[12px]">· {Math.round(f.kcal100g)} kcal/100 g</span>
        </button>
      ))}
    </div>
  );
}

function RecipeBuilder({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [ings, setIngs] = useState<Ing[]>([]);
  const [yieldG, setYieldG] = useState("");
  const [servingLabel, setServingLabel] = useState("1 katori");
  const [servingG, setServingG] = useState("");
  const [pending, start] = useTransition();
  const per = useMemo(
    () =>
      recipePer100(
        ings.map((i) => ({ food: { kcal: i.food.kcal100g, protein: i.food.protein100g, carbs: i.food.carbs100g, fat: i.food.fat100g, fibre: i.food.fibre100g }, grams: i.grams })),
        Number(yieldG) || null
      ),
    [ings, yieldG]
  );
  const save = () =>
    start(async () => {
      const r = await saveRecipeAction({
        name,
        ingredients: ings.map((i) => ({ foodId: i.food.id, grams: i.grams })),
        yieldG: Number(yieldG) || null,
        servingLabel: servingG ? servingLabel : null,
        servingG: Number(servingG) || null,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Saved ${name}`);
      onDone();
    });
  return (
    <div className="max-w-lg mx-auto w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button type="button" onClick={onCancel} className="h-11 px-2 text-fg-2">Cancel</button>
        <span className="font-semibold">New recipe</span>
        <button type="button" onClick={save} disabled={pending || !name.trim() || !ings.length} className={`${btn} bg-accent text-accent-ink`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Home toor dal)" className={input} />
        <section className="flex flex-col gap-2">
          <h3 className="section-label m-0">Ingredients, weighed raw</h3>
          {ings.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex-1 text-[14px] truncate">{i.food.name}</span>
              <input
                type="number"
                inputMode="decimal"
                value={i.grams || ""}
                onChange={(e) => setIngs((xs) => xs.map((x, j) => (j === idx ? { ...x, grams: Number(e.target.value) || 0 } : x)))}
                aria-label={`Grams of ${i.food.name}`}
                className="w-20 h-10 px-2 rounded-[10px] bg-surface-2 num text-right"
              />
              <span className="text-[13px] text-muted">g</span>
              <button type="button" onClick={() => setIngs((xs) => xs.filter((_, j) => j !== idx))} aria-label="Remove" className="h-10 w-8 text-danger-soft">×</button>
            </div>
          ))}
          <IngredientSearch onPick={(f) => setIngs((xs) => [...xs, { food: f, grams: 0 }])} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="section-label m-0">Cooked weight of the whole pot</h3>
          <div className="flex items-center gap-2">
            <input type="number" inputMode="decimal" value={yieldG} onChange={(e) => setYieldG(e.target.value)} placeholder={String(Math.round(per.rawG) || "")} className={`${input} num`} />
            <span className="text-[13px] text-muted">g</span>
          </div>
          <p className="m-0 text-[12px] text-muted">Weigh the pot after cooking, minus the pot. Water changes everything: 100 g dry dal can become 400 g.</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="section-label m-0">Your usual portion (optional)</h3>
          <div className="flex gap-2">
            <input value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} className={input} />
            <input type="number" inputMode="decimal" value={servingG} onChange={(e) => setServingG(e.target.value)} placeholder="grams" className={`${input} w-28 num`} />
          </div>
        </section>
        {ings.length > 0 && (
          <p className="m-0 text-[14px] num">
            Per 100 g: <strong>{Math.round(per.kcal)} kcal</strong> · {per.protein} g protein · {per.carbs} g carbs · {per.fat} g fat
          </p>
        )}
      </div>
    </div>
  );
}

function LabelFood({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", fibre: "", servingG: "", servingLabel: "1 serving", perServing: false });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "perServing" ? e.target.checked : e.target.value });
  const save = () =>
    start(async () => {
      const r = await createUserFoodAction({
        name: f.name,
        brand: f.brand || null,
        kcal: Number(f.kcal),
        protein: Number(f.protein),
        carbs: Number(f.carbs),
        fat: Number(f.fat),
        fibre: Number(f.fibre || 0),
        perServing: f.perServing,
        servingG: Number(f.servingG) || null,
        servingLabel: f.servingLabel,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Saved ${f.name}`);
      onDone();
    });
  const numField = (k: keyof typeof f, label: string) => (
    <label className="flex flex-col gap-1 text-[13px] text-muted">
      {label}
      <input type="number" inputMode="decimal" value={f[k] as string} onChange={set(k)} className={`${input} num`} />
    </label>
  );
  return (
    <div className="max-w-lg mx-auto w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button type="button" onClick={onCancel} className="h-11 px-2 text-fg-2">Cancel</button>
        <span className="font-semibold">Food from a label</span>
        <button type="button" onClick={save} disabled={pending || !f.name.trim() || f.kcal === ""} className={`${btn} bg-accent text-accent-ink`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-3">
        <input value={f.name} onChange={set("name")} placeholder="Name" className={input} />
        <input value={f.brand} onChange={set("brand")} placeholder="Brand (optional)" className={input} />
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={f.perServing} onChange={set("perServing")} /> Label values are per serving, not per 100 g
        </label>
        <div className="grid grid-cols-2 gap-2">
          {numField("servingG", "Serving (g)")}
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Serving name
            <input value={f.servingLabel} onChange={set("servingLabel")} className={input} />
          </label>
          {numField("kcal", "Calories")}
          {numField("protein", "Protein (g)")}
          {numField("carbs", "Carbs (g)")}
          {numField("fat", "Fat (g)")}
          {numField("fibre", "Fibre (g)")}
        </div>
      </div>
    </div>
  );
}
