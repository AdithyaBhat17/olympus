import Link from "next/link";
import { requireUserEmail } from "@/lib/auth";
import { myFoods } from "@/server/food/foods";
import { PageHeader, BackIcon } from "@/components/page-header";
import { MyFoods } from "@/components/food/my-foods";

export const metadata = { title: "My foods" };

export default async function MyFoodsPage() {
  const userId = await requireUserEmail();
  const foods = await myFoods(userId);
  return (
    <div className="pb-10">
      <div className="px-4 pt-4">
        <Link href="/food" className="inline-flex items-center gap-1 h-9 pr-3 text-fg-2 text-[15px]">
          <BackIcon /> Food
        </Link>
      </div>
      <PageHeader title="My foods" eyebrow="Recipes and your own foods come first in search" />
      <MyFoods foods={foods} />
    </div>
  );
}
