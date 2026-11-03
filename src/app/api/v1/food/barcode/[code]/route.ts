import { route } from "@/server/api";
import { DomainError } from "@/server/errors";
import { barcodeSummary } from "@/server/food/screen";

export const GET = route<{ code: string }>(async ({ userId, params }) => {
  const code = params.code.replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) throw new DomainError("That isn't a barcode number.");
  return barcodeSummary(userId, code);
});
