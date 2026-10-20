"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { downloadQuoteAsPdf } from "@/lib/pdf-download";

type Platform = "interflow" | "roduod";
type Item = { name: string; description: string; qty: number; price: number };
type Draft = {
  platform: Platform;
  quoteNumber: string;
  status: string;
  issueDate: string;
  expiryDate: string;
  clientName: string;
  clientNumber: string;
  discount: number;
  tax: number;
  validDays: number;
  notes: string;
  items: Item[];
};

const brands = {
  interflow: {
    label: "انترفلو",
    logo: "/interflow-logo.png",
    accent: "#08afd0",
    dark: "#18192f",
    logoSurface: "transparent",
    stamp: "/company-stamp.png",
    domain: "interflow.sa",
    email: "info@interflow.sa",
    optionText: "هوية انترفلو",
  },
  roduod: {
    label: "ردود",
    logo: "/roduod-logo.png",
    accent: "#08733f",
    dark: "#064f30",
    logoSurface: "#ffffff",
    stamp: "/roduod-stamp.png",
    domain: "منصة ردود",
    email: "info@roduod.com",
    optionText: "هوية ردود",
  },
} as const;

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

const initialDraft = (platform: Platform = "interflow"): Draft => ({
  platform,
  quoteNumber: "",
  status: "عرض سعر",
  issueDate: today(),
  expiryDate: plusDays(today(), 3),
  clientName: "",
  clientNumber: "",
  discount: 0,
  tax: 0,
  validDays: 3,
  notes:
    "الأسعار المذكورة شاملة/غير شاملة ضريبة القيمة المضافة حسب ما هو موضح.\nعرض السعر صالح للفترة المحددة أعلاه فقط.\nيحق للشركة تعديل الأسعار بعد انتهاء صلاحية العرض.",
  items: [{ name: "", description: "-", qty: 1, price: 0 }],
});

const money = (value: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value || 0)} ريال`;
const displayDate = (value: string) => (value ? value.replaceAll("-", "/") : "-");

export default function Home() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [ready, setReady] = useState(false);
  const [numberError, setNumberError] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [newQuotePlatform, setNewQuotePlatform] = useState<Platform>("interflow");
  const brand = brands[draft.platform];
  const platformRef = useRef<Platform>(draft.platform);
  const toolRegisteredRef = useRef(false);
  platformRef.current = draft.platform;

  async function allocateNumber(reset = false, platform?: Platform) {
    setAllocating(true);
    setNumberError("");
    try {
      const response = await fetch("/api/quote-number", { method: "POST" });
      const data = (await response.json()) as { number?: string; error?: string };
      if (!response.ok || !data.number) throw new Error(data.error || "تعذر توليد الرقم");
      setDraft((current) =>
        reset
          ? { ...initialDraft(platform || current.platform), quoteNumber: data.number! }
          : { ...current, quoteNumber: data.number! },
      );
      return true;
    } catch (error) {
      setNumberError(error instanceof Error ? error.message : "تعذر توليد رقم العرض");
      return false;
    } finally {
      setAllocating(false);
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("interflow-current-quote");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Draft>;
        if (parsed.quoteNumber) {
          setDraft({
            ...initialDraft(parsed.platform === "roduod" ? "roduod" : "interflow"),
            ...parsed,
            platform: parsed.platform === "roduod" ? "roduod" : "interflow",
          } as Draft);
          setReady(true);
          return;
        }
      }
    } catch {
      localStorage.removeItem("interflow-current-quote");
    }
    allocateNumber().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      queueMicrotask(() => setNewQuoteOpen(true));
    }
  }, []);

  useEffect(() => {
    if (ready && draft.quoteNumber) {
      localStorage.setItem("interflow-current-quote", JSON.stringify(draft));
    }
  }, [draft, ready]);

  useEffect(() => {
    const context = (
      document as Document & { modelContext?: { registerTool: (tool: unknown) => void } }
    ).modelContext;
    if (!context?.registerTool || toolRegisteredRef.current) return;
    toolRegisteredRef.current = true;
    context.registerTool({
      name: "start_new_quote",
      title: "إنشاء عرض سعر جديد",
      description: "ينشئ عرض سعر جديدًا للمنصة المحددة ويحجز له رقمًا فريدًا.",
      inputSchema: {
        type: "object",
        properties: { platform: { type: "string", enum: ["interflow", "roduod"] } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: { platform?: Platform }) => {
        const selectedPlatform = input.platform || platformRef.current;
        await allocateNumber(true, selectedPlatform);
        return { status: "created", platform: selectedPlatform };
      },
    });
  });

  const totals = useMemo(() => {
    const subtotal = draft.items.reduce(
      (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
      0,
    );
    const discount = Math.min(Math.max(Number(draft.discount) || 0, 0), subtotal);
    const afterDiscount = subtotal - discount;
    const taxAmount = (afterDiscount * Math.max(Number(draft.tax) || 0, 0)) / 100;
    return { subtotal, afterDiscount, taxAmount, grand: afterDiscount + taxAmount };
  }, [draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setItem = (index: number, key: keyof Item, value: string | number) =>
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    }));
  const newQuote = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("new", "1");
    const opened = window.open(url.toString(), "_blank");
    if (opened) {
      opened.opener = null;
    } else {
      setNewQuotePlatform(draft.platform);
      setNewQuoteOpen(true);
    }
  };
  const createNewQuote = async () => {
    const created = await allocateNumber(true, newQuotePlatform);
    if (created) {
      setNewQuoteOpen(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.toString());
    }
  };
  const printQuote = () => window.print();
  const downloadPdf = async () => {
    if (pdfGenerating) return;
    const safeNumber = (draft.quoteNumber || "جديد").replace("#", "");
    setPdfGenerating(true);
    setPdfError("");
    try {
      await downloadQuoteAsPdf(
        {
          ...draft,
          totals,
          brand,
        },
        `عرض-سعر-${safeNumber}.pdf`,
      );
    } catch {
      setPdfError("تعذر تنزيل ملف PDF. حاول مرة أخرى.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const brandStyles = {
    "--cyan": brand.accent,
    "--navy": brand.dark,
    "--logo-surface": brand.logoSurface,
  } as CSSProperties;

  return (
    <main className={`brand-main brand-${draft.platform}`} style={brandStyles}>
      <header className="appbar">
        <div className="app-title">
          <BrandLogo brand={brand} />
          <span>منشئ عروض الأسعار</span>
        </div>
        <div className="app-actions">
          <Button
            variant="outline"
            className="app-action-secondary"
            onClick={downloadPdf}
            disabled={!draft.quoteNumber || pdfGenerating}
            aria-label="تنزيل ملف PDF"
            title="تنزيل ملف PDF"
          >
            <Download />
            <span className="button-label">{pdfGenerating ? "جاري التجهيز..." : "تنزيل PDF"}</span>
          </Button>
          <Button
            variant="outline"
            className="app-action-secondary"
            onClick={printQuote}
            disabled={!draft.quoteNumber}
            aria-label="طباعة عرض السعر"
            title="طباعة"
          >
            <Printer /> <span className="button-label">طباعة</span>
          </Button>
          <Button className="new-quote" onClick={newQuote} disabled={allocating}>
            <Plus /> <span className="button-label">عرض جديد</span>
          </Button>
        </div>
      </header>

      <div className="workspace">
        <aside className="editor">
          <h1>بيانات عرض السعر</h1>
          <p className="helper">أي تعديل يظهر مباشرة في المعاينة ويحفظ تلقائيًا على هذا الجهاز.</p>

          <section className="platform-section">
            <h2>اختر المنصة</h2>
            <p className="platform-hint">اختر الهوية التي سيصدر بها عرض السعر.</p>
            <PlatformPicker
              value={draft.platform}
              onValueChange={(value) => set("platform", value as Platform)}
              idPrefix="editor-platform"
            />
          </section>

          <section>
            <h2>معلومات العرض والعميل</h2>
            <div className="field">
              <span>رقم العرض التلقائي</span>
              <div className="locked-number">
                {draft.quoteNumber || (allocating ? "جاري التوليد..." : "غير متوفر")}
              </div>
              {numberError && (
                <div className="error">
                  {numberError} <button onClick={() => allocateNumber()}>إعادة المحاولة</button>
                </div>
              )}
            </div>
            <div className="two">
              <Field label="حالة الطلب">
                <Input
                  value={draft.status}
                  onChange={(event) => set("status", event.target.value)}
                  placeholder="مثال: عرض سعر، مبدئي، معتمد"
                />
                <small className="field-note">يظهر النص نفسه مباشرة في أعلى العرض وفي عنوانه.</small>
              </Field>
              <Field label="تاريخ الإصدار">
                <Input
                  type="date"
                  value={draft.issueDate}
                  onChange={(event) => set("issueDate", event.target.value)}
                />
              </Field>
            </div>
            <div className="two">
              <Field label="صالح حتى">
                <Input
                  type="date"
                  value={draft.expiryDate}
                  onChange={(event) => set("expiryDate", event.target.value)}
                />
              </Field>
              <Field label="مدة الصلاحية بالأيام">
                <Input
                  type="number"
                  min={1}
                  value={draft.validDays}
                  onChange={(event) => set("validDays", Number(event.target.value))}
                />
              </Field>
            </div>
            <Field label="اسم العميل / المؤسسة">
              <Input
                value={draft.clientName}
                onChange={(event) => set("clientName", event.target.value)}
                placeholder="مثال: مؤسسة الندى"
              />
            </Field>
            <Field label="الرقم الضريبي أو السجل">
              <Input
                value={draft.clientNumber}
                onChange={(event) => set("clientNumber", event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </section>

          <section>
            <h2>البنود</h2>
            {draft.items.map((item, index) => (
              <div className="item-card" key={index}>
                <div className="item-heading">
                  <strong>البند {index + 1}</strong>
                  <button
                    className="remove"
                    disabled={draft.items.length === 1}
                    onClick={() => set("items", draft.items.filter((_, i) => i !== index))}
                  >
                    <Trash2 /> حذف
                  </button>
                </div>
                <Field label="اسم الصنف">
                  <Input
                    value={item.name}
                    onChange={(event) => setItem(index, "name", event.target.value)}
                  />
                </Field>
                <Field label="الوصف">
                  <Input
                    value={item.description}
                    onChange={(event) => setItem(index, "description", event.target.value)}
                  />
                </Field>
                <div className="two">
                  <Field label="العدد">
                    <Input
                      type="number"
                      min={0}
                      value={item.qty}
                      onChange={(event) => setItem(index, "qty", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="سعر الوحدة">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.price}
                      onChange={(event) => setItem(index, "price", Number(event.target.value))}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="add-item"
              onClick={() =>
                set("items", [...draft.items, { name: "", description: "-", qty: 1, price: 0 }])
              }
            >
              <Plus /> إضافة بند
            </Button>
          </section>

          <section>
            <h2>الحساب والملاحظات</h2>
            <div className="two">
              <Field label="الخصم (ريال)">
                <Input
                  type="number"
                  min={0}
                  value={draft.discount}
                  onChange={(event) => set("discount", Number(event.target.value))}
                />
              </Field>
              <Field label="الضريبة (%)">
                <Input
                  type="number"
                  min={0}
                  value={draft.tax}
                  onChange={(event) => set("tax", Number(event.target.value))}
                />
              </Field>
            </div>
            <Field label="الملاحظات">
              <Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
            </Field>
          </section>

          <div className="quote-actions bottom-actions">
            <Button
              className="download-quote"
              onClick={downloadPdf}
              disabled={!draft.quoteNumber || pdfGenerating}
            >
              <Download /> {pdfGenerating ? "جاري تجهيز PDF..." : "تنزيل ملف PDF"}
            </Button>
            <Button
              variant="outline"
              className="print-quote"
              onClick={printQuote}
              disabled={!draft.quoteNumber}
            >
              <Printer /> طباعة
            </Button>
          </div>
          {pdfError && <p className="pdf-error" role="alert">{pdfError}</p>}
        </aside>

        <section className="preview">
          <div className="preview-label">
            <span>المعاينة النهائية - {brand.label}</span>
            <span>A4</span>
          </div>
          <div className="sheet-scroll">
            <article className="quote-sheet">
              <header className="quote-header">
                <BrandLogo brand={brand} />
                <strong>شركة القائمة الرقمية لتقنية المعلومات</strong>
                <span>{brand.domain}</span>
              </header>
              <div className="quote-body">
                <div className="meta">
                  <div><b>تاريخ الإصدار:</b> {displayDate(draft.issueDate)}</div>
                  <div><b>صالح حتى:</b> {displayDate(draft.expiryDate)}</div>
                  <div><b>حالة الطلب:</b> <span className="status-value">{draft.status || "-"}</span></div>
                </div>
                <div className="quote-title">
                  <h2>{draft.status || "عرض سعر"}</h2>
                  <strong>{draft.quoteNumber || "..."}</strong>
                  <div><b>{draft.clientName || "اسم العميل"}</b><span>{draft.clientNumber}</span></div>
                </div>
                <table>
                  <thead><tr><th>الصنف</th><th>الوصف</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {draft.items.map((item, index) => (
                      <tr key={index}>
                        <td><b>{item.name || "-"}</b></td><td>{item.description || "-"}</td>
                        <td>{item.qty || 0}</td><td>{money(item.price)}</td>
                        <td><b>{money((item.qty || 0) * (item.price || 0))}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="summary">
                  <b>المجموع قبل الخصم:</b><strong>{money(totals.subtotal)}</strong>
                  <b>المجموع بعد الخصم:</b><strong>{money(totals.afterDiscount)}</strong>
                  <b>الضريبة ({draft.tax || 0}%):</b><strong>{money(totals.taxAmount)}</strong>
                  <div><b>الإجمالي شامل الضريبة:</b><strong>{money(totals.grand)}</strong></div>
                </div>
                <p className="validity">هذا العرض صالح لمدة {draft.validDays || 0} أيام من تاريخ الإصدار</p>
                <div className="notes"><b>ملاحظة:</b><p>{draft.notes || "-"}</p></div>
                <PlatformStamp platform={draft.platform} brand={brand} />
              </div>
              <footer>
                <span>{brand.domain}</span><span>{brand.email}</span><span>سجل تجاري: 7051649650</span>
              </footer>
            </article>
          </div>
        </section>
      </div>

      <Dialog
        open={newQuoteOpen}
        onOpenChange={(open) => {
          setNewQuoteOpen(open);
          if (!open) {
            const url = new URL(window.location.href);
            url.searchParams.delete("new");
            window.history.replaceState({}, "", url.toString());
          }
        }}
      >
        <DialogContent
          className="new-quote-dialog"
          dir="rtl"
          style={{
            "--cyan": brands[newQuotePlatform].accent,
            "--navy": brands[newQuotePlatform].dark,
          } as CSSProperties}
        >
          <DialogHeader>
            <DialogTitle>إنشاء عرض سعر جديد</DialogTitle>
            <DialogDescription>
              اختر المنصة أولًا، ثم سنفتح لك نموذجًا فارغًا برقم عرض جديد وفريد.
            </DialogDescription>
          </DialogHeader>
          <PlatformPicker
            value={newQuotePlatform}
            onValueChange={setNewQuotePlatform}
            idPrefix="new-quote-platform"
          />
          {numberError && <p className="new-quote-error">{numberError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewQuoteOpen(false)} disabled={allocating}>
              إلغاء
            </Button>
            <Button className="create-quote" onClick={createNewQuote} disabled={allocating}>
              <Plus /> {allocating ? "جاري إنشاء العرض..." : "إنشاء العرض الجديد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function PlatformPicker({
  value,
  onValueChange,
  idPrefix,
}: {
  value: Platform;
  onValueChange: (value: Platform) => void;
  idPrefix: string;
}) {
  return (
    <RadioGroup
      className="platform-choices"
      value={value}
      onValueChange={(platform) => onValueChange(platform as Platform)}
      aria-label="اختيار منصة عرض السعر"
    >
      {(Object.keys(brands) as Platform[]).map((platform) => {
        const option = brands[platform];
        const selected = value === platform;
        const id = `${idPrefix}-${platform}`;

        return (
          <label
            className={`platform-choice platform-choice-${platform}${selected ? " is-active" : ""}`}
            htmlFor={id}
            key={platform}
          >
            <RadioGroupItem className="platform-radio" id={id} value={platform} />
            <BrandLogo brand={option} />
            <strong>{option.optionText}</strong>
            <span className="choice-check" aria-hidden="true">✓</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

function BrandLogo({ brand }: { brand: (typeof brands)[Platform] }) {
  return <span className="brand-logo-surface"><img src={brand.logo} alt={`شعار ${brand.label}`} /></span>;
}

function PlatformStamp({ platform, brand }: { platform: Platform; brand: (typeof brands)[Platform] }) {
  return (
    <div className={`platform-stamp platform-stamp-${platform}`} aria-label={`ختم منصة ${brand.label}`}>
      <img src={brand.stamp} alt={`ختم ${brand.label}`} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
