"use server";

import { revalidatePath } from "next/cache";
import { requireUserEmail } from "@/lib/auth";
import { DomainError } from "@/server/errors";
import { nudgeSummary } from "@/domain/supplements";
import type { SupplementSlot } from "@/lib/db/schema";
import {
  addAppointment,
  addInventory,
  addLabResult,
  addSupplement,
  archiveSupplement,
  clearDose,
  deleteAppointment,
  deleteLabResult,
  setDose,
  takeSlot,
  updateSupplement,
  type SupplementInput,
} from "@/server/supplements";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: (userId: string) => Promise<T>): Promise<R<T>> {
  try {
    const data = await fn(await requireUserEmail());
    revalidatePath("/supplements");
    revalidatePath("/food");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const str = (v: unknown, max = 200) => String(v ?? "").slice(0, max);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function takeSlotAction(slot: SupplementSlot, date?: string) {
  return run(async (userId) => {
    const r = await takeSlot(userId, slot, isDate(date) ? date : undefined);
    const summary = nudgeSummary(r.nudges);
    return { logged: r.logged, nudges: summary ? [summary] : [] };
  });
}

export async function setDoseAction(id: string, status: "taken" | "half" | "skipped", opts: { date?: string; late?: boolean; multiplier?: number } = {}) {
  return run(async (userId) => {
    if (!["taken", "half", "skipped"].includes(status)) throw new DomainError("Unknown status.");
    const r = await setDose(userId, str(id, 40), {
      status,
      date: isDate(opts.date) ? opts.date : undefined,
      late: !!opts.late,
      multiplier: opts.multiplier ? Number(opts.multiplier) : undefined,
    });
    const summary = nudgeSummary(r.nudges);
    return { nudges: summary ? [summary] : [] };
  });
}

export async function clearDoseAction(id: string, date: string) {
  return run((userId) => {
    if (!isDate(date)) throw new DomainError("Bad date.");
    return clearDose(userId, str(id, 40), date);
  });
}

function input(i: SupplementInput): SupplementInput {
  return {
    name: str(i.name, 120),
    brand: i.brand ? str(i.brand, 80) : null,
    form: i.form,
    servingDesc: i.servingDesc ? str(i.servingDesc, 60) : undefined,
    servingsPerDose: Number(i.servingsPerDose ?? 1),
    servingsPerContainer: i.servingsPerContainer ? Number(i.servingsPerContainer) : null,
    slot: i.slot,
    activeDays: (i.activeDays ?? []).map(Number),
    tags: (i.tags ?? []).map((t) => str(t, 30)),
    markers: (i.markers ?? []).map((m) => str(m, 20)),
    foodId: i.foodId ? str(i.foodId, 40) : null,
    foodGramsPerServing: i.foodGramsPerServing ? Number(i.foodGramsPerServing) : null,
    whereToBuy: (i.whereToBuy ?? []).map((w) => ({ region: str(w.region, 20), note: str(w.note, 120) })),
    notes: i.notes ? str(i.notes, 500) : null,
  };
}

export async function saveSupplementAction(id: string | null, i: SupplementInput) {
  return run(async (userId) => {
    if (id) {
      await updateSupplement(userId, str(id, 40), input(i));
      return id;
    }
    return addSupplement(userId, input(i));
  });
}

export async function archiveSupplementAction(id: string) {
  return run((userId) => archiveSupplement(userId, str(id, 40)));
}

export async function inventoryAction(id: string, servings: number, kind: "restock" | "count", region?: string) {
  return run((userId) =>
    addInventory(userId, str(id, 40), { servings: Number(servings), kind: kind === "count" ? "count" : "restock", region: region ? str(region, 20) : null })
  );
}

export async function addLabResultAction(r: { drawnOn: string; marker: string; value: number; unit?: string; refLow?: number | null; refHigh?: number | null }) {
  return run((userId) =>
    addLabResult(userId, {
      drawnOn: str(r.drawnOn, 10),
      marker: str(r.marker, 20),
      value: Number(r.value),
      unit: r.unit ? str(r.unit, 20) : undefined,
      refLow: r.refLow == null || (r.refLow as unknown) === "" ? null : Number(r.refLow),
      refHigh: r.refHigh == null || (r.refHigh as unknown) === "" ? null : Number(r.refHigh),
    })
  );
}

export async function deleteLabResultAction(id: string) {
  return run((userId) => deleteLabResult(userId, str(id, 40)));
}

export async function addAppointmentAction(a: { date: string; time: string; markers: string[]; fasting: boolean; thyroidMedInstruction?: string }) {
  return run((userId) =>
    addAppointment(userId, {
      date: str(a.date, 10),
      time: str(a.time, 5),
      markers: (a.markers ?? []).map((m) => str(m, 20)),
      fasting: !!a.fasting,
      thyroidMedInstruction: a.thyroidMedInstruction ? str(a.thyroidMedInstruction, 200) : null,
    })
  );
}

export async function deleteAppointmentAction(id: string) {
  return run((userId) => deleteAppointment(userId, str(id, 40)));
}
