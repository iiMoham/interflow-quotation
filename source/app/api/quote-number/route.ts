import { getDb } from "../../../db";
import { quoteNumbers } from "../../../db/schema";

export async function POST() {
  try {
    const db = getDb();
    const [quote] = await db.insert(quoteNumbers).values({}).returning({ id: quoteNumbers.id });
    if (!quote) return Response.json({ error: "تعذر إنشاء رقم العرض" }, { status: 500 });
    return Response.json({ number: `#Qut${String(quote.id).padStart(4, "0")}` }, { status: 201 });
  } catch (error) {
    console.error("quote-number allocation failed", error);
    return Response.json({ error: "تعذر توليد رقم العرض. حاول مرة أخرى." }, { status: 503 });
  }
}
