"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Plus, Printer, Trash2 } from "lucide-react";
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
import { amountInWords, daysText } from "@/lib/tafqit";

type Platform = "interflow" | "roduod";

// GitHub Pages builds are static: assets live under the repo sub-path and there is no
// server, so quote numbers come from a per-browser counter instead of /api/quote-number.
const staticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const LOCAL_COUNTER_KEY = "interflow-quote-counter";
const LOCAL_COUNTER_START = 62;
// price is the unit price after discount; oldPrice is the previous price (0 = none).
type Item = { name: string; description: string; qty: number; oldPrice: number; price: number };
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
    logo: `${basePath}/interflow-logo.png`,
    accent: "#08afd0",
    dark: "#18192f",
    logoSurface: "transparent",
    stamp: `${basePath}/company-stamp.png`,
    domain: "interflow.sa",
    email: "info@interflow.sa",
    optionText: "هوية انترفلو",
  },
  roduod: {
    label: "ردود",
    logo: `${basePath}/roduod-logo.png`,
    accent: "#08733f",
    dark: "#064f30",
    logoSurface: "#ffffff",
    stamp: `${basePath}/roduod-stamp.png`,
    domain: "منصة ردود",
    email: "info@roduod.com",
    optionText: "هوية ردود",
  },
} as const;

// Local calendar dates: toISOString() is UTC and lags a day after midnight in Saudi time.
const localDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const today = () => localDate(new Date());
const plusDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
};
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
const DEFAULT_VALID_DAYS = 3;
const emptyItem = (): Item => ({ name: "", description: "-", qty: 1, oldPrice: 0, price: 0 });
const previousPrice = (item: Item) =>
  (Number(item.oldPrice) || 0) > (Number(item.price) || 0) ? Number(item.oldPrice) : null;
const discountPercent = (item: Item) => {
  const old = previousPrice(item);
  return old === null ? null : Math.round((1 - (Number(item.price) || 0) / old) * 100);
};
const VALIDITY_PRESETS = [3, 7, 14, 30];
const VAT_RATE = 15;
// Typing into a number field that shows 0 should replace it, not append to it.
const selectOnFocus = (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select();

const initialDraft = (platform: Platform = "interflow"): Draft => ({
  platform,
  quoteNumber: "",
  status: "عرض سعر",
  issueDate: today(),
  expiryDate: plusDays(today(), DEFAULT_VALID_DAYS),
  clientName: "",
  clientNumber: "",
  discount: 0,
  tax: 0,
  validDays: DEFAULT_VALID_DAYS,
  notes:
    "الأسعار المذكورة شاملة/غير شاملة ضريبة القيمة المضافة حسب ما هو موضح.\nعرض السعر صالح للفترة المحددة أعلاه فقط.\nيحق للشركة تعديل الأسعار بعد انتهاء صلاحية العرض.",
  items: [emptyItem()],
});

// Whole amounts stay short ("500 ريال"); fractional ones always show halalas ("175.50 ريال").
const money = (value: number) => {
  const amount = value || 0;
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: 2 }).format(amount)} ريال`;
};
const displayDate = (value: string) => (value ? value.replaceAll("-", "/") : "-");

async function fetchServerNumber() {
  const response = await fetch("/api/quote-number", { method: "POST" });
  const data = (await response.json()) as { number?: string; error?: string };
  if (!response.ok || !data.number) throw new Error(data.error || "تعذر توليد الرقم");
  return data as { number: string };
}

function nextLocalNumber() {
  const last = Number(localStorage.getItem(LOCAL_COUNTER_KEY)) || LOCAL_COUNTER_START;
  const next = last + 1;
  localStorage.setItem(LOCAL_COUNTER_KEY, String(next));
  return { number: `#Qut${String(next).padStart(4, "0")}` };
}

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
      const data = staticExport ? nextLocalNumber() : await fetchServerNumber();
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
          // Reopened drafts are dated today; the expiry follows from the validity days.
          const validDays = Number(parsed.validDays) > 0 ? Number(parsed.validDays) : DEFAULT_VALID_DAYS;
          setDraft({
            ...initialDraft(parsed.platform === "roduod" ? "roduod" : "interflow"),
            ...parsed,
            platform: parsed.platform === "roduod" ? "roduod" : "interflow",
            issueDate: today(),
            expiryDate: plusDays(today(), validDays),
            validDays,
            items: (parsed.items?.length ? parsed.items : [emptyItem()]).map((item) => ({
              ...emptyItem(),
              ...item,
            })),
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
    const qty = (item: Item) => Number(item.qty) || 0;
    // Before discount uses each item's previous price when it has one.
    const subtotal = draft.items.reduce(
      (sum, item) => sum + qty(item) * (previousPrice(item) ?? (Number(item.price) || 0)),
      0,
    );
    const itemsTotal = draft.items.reduce((sum, item) => sum + qty(item) * (Number(item.price) || 0), 0);
    const extraDiscount = Math.min(Math.max(Number(draft.discount) || 0, 0), itemsTotal);
    const afterDiscount = itemsTotal - extraDiscount;
    const discountTotal = subtotal - afterDiscount;
    const taxAmount = (afterDiscount * Math.max(Number(draft.tax) || 0, 0)) / 100;
    return { subtotal, discountTotal, afterDiscount, taxAmount, grand: afterDiscount + taxAmount };
  }, [draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  // Issue date, validity days and expiry date stay in sync: expiry = issue + days.
  const setIssueDate = (issueDate: string) =>
    setDraft((current) => ({
      ...current,
      issueDate,
      expiryDate: issueDate ? plusDays(issueDate, current.validDays || 0) : current.expiryDate,
    }));
  const setValidDays = (validDays: number) =>
    setDraft((current) => ({
      ...current,
      validDays,
      expiryDate: current.issueDate && validDays > 0 ? plusDays(current.issueDate, validDays) : current.expiryDate,
    }));
  const setExpiryDate = (expiryDate: string) =>
    setDraft((current) => {
      const days = current.issueDate && expiryDate ? daysBetween(current.issueDate, expiryDate) : 0;
      return { ...current, expiryDate, validDays: days > 0 ? days : current.validDays };
    });
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
  const duplicateItem = (index: number) =>
    setDraft((current) => ({
      ...current,
      items: [...current.items.slice(0, index + 1), { ...current.items[index] }, ...current.items.slice(index + 1)],
    }));
  const noteLines = draft.notes.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!noteLines.length) noteLines.push("-");
  const savingsPercent = totals.subtotal > 0 ? Math.round((totals.discountTotal / totals.subtotal) * 100) : 0;
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
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </Field>
            </div>
            <div className="two">
              <Field label="صالح حتى">
                <Input
                  type="date"
                  value={draft.expiryDate}
                  min={draft.issueDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                />
              </Field>
              <Field label="مدة الصلاحية بالأيام">
                <Input
                  type="number"
                  min={1}
                  value={draft.validDays}
                  onFocus={selectOnFocus}
                  onChange={(event) => setValidDays(Number(event.target.value))}
                />
              </Field>
            </div>
            <div className="chips" role="group" aria-label="مدة صلاحية سريعة">
              <span>صلاحية سريعة:</span>
              {VALIDITY_PRESETS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`chip${draft.validDays === days ? " is-active" : ""}`}
                  aria-pressed={draft.validDays === days}
                  onClick={() => setValidDays(days)}
                >
                  {daysText(days)}
                </button>
              ))}
            </div>
            <Field label="اسم العميل / المؤسسة">
              <Input
                value={draft.clientName}
                onChange={(event) => set("clientName", event.target.value)}
                placeholder="مثال: مؤسسة الندى"
                aria-invalid={!draft.clientName.trim() || undefined}
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
                  <span className="item-total">
                    {money((Number(item.qty) || 0) * (Number(item.price) || 0))}
                    {discountPercent(item) !== null && (
                      <span className="discount-badge">خصم {discountPercent(item)}%</span>
                    )}
                  </span>
                  <span className="item-tools">
                    <button type="button" className="duplicate" onClick={() => duplicateItem(index)} title="تكرار البند">
                      <Copy /> تكرار
                    </button>
                    <button
                      type="button"
                      className="remove"
                      disabled={draft.items.length === 1}
                      onClick={() => set("items", draft.items.filter((_, i) => i !== index))}
                    >
                      <Trash2 /> حذف
                    </button>
                  </span>
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
                <Field label="العدد">
                  <Input
                    type="number"
                    min={0}
                    value={item.qty}
                    onFocus={selectOnFocus}
                    onChange={(event) => setItem(index, "qty", Number(event.target.value))}
                  />
                </Field>
                <div className="two">
                  <Field label="السعر السابق">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.oldPrice}
                      onFocus={selectOnFocus}
                      onChange={(event) => setItem(index, "oldPrice", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="السعر بعد الخصم">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.price}
                      onFocus={selectOnFocus}
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
                set("items", [...draft.items, emptyItem()])
              }
            >
              <Plus /> إضافة بند
            </Button>
          </section>

          <section>
            <h2>الحساب والملاحظات</h2>
            <div className="two">
              <Field label="خصم إضافي (ريال)">
                <Input
                  type="number"
                  min={0}
                  value={draft.discount}
                  onFocus={selectOnFocus}
                  onChange={(event) => set("discount", Number(event.target.value))}
                />
              </Field>
              <Field label="الضريبة (%)">
                <Input
                  type="number"
                  min={0}
                  value={draft.tax}
                  onFocus={selectOnFocus}
                  onChange={(event) => set("tax", Number(event.target.value))}
                />
              </Field>
            </div>
            <div className="chips">
              <button
                type="button"
                className={`chip${draft.tax === VAT_RATE ? " is-active" : ""}`}
                aria-pressed={draft.tax === VAT_RATE}
                onClick={() => set("tax", draft.tax === VAT_RATE ? 0 : VAT_RATE)}
              >
                {draft.tax === VAT_RATE ? "✓ " : ""}ضريبة القيمة المضافة {VAT_RATE}%
              </button>
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
          {!draft.clientName.trim() && (
            <p className="client-reminder">تنبيه: لم يُكتب اسم العميل بعد، وسيظهر في العرض «اسم العميل».</p>
          )}
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
                <div className="quote-title">
                  <h2>{draft.status || "عرض سعر"}</h2>
                  <strong>{draft.quoteNumber || "..."}</strong>
                </div>
                <div className="info-cards">
                  <div className="info-card">
                    <span className="info-label">مقدَّم إلى</span>
                    <b className="client-name">{draft.clientName || "اسم العميل"}</b>
                    {draft.clientNumber && <span className="client-number">الرقم الضريبي / السجل: <bdi>{draft.clientNumber}</bdi></span>}
                  </div>
                  <div className="info-card">
                    <span className="info-label">تفاصيل العرض</span>
                    <dl>
                      <dt>تاريخ الإصدار</dt><dd>{displayDate(draft.issueDate)}</dd>
                      <dt>صالح حتى</dt><dd>{displayDate(draft.expiryDate)}</dd>
                      <dt>حالة الطلب</dt><dd className="status-value">{draft.status || "-"}</dd>
                    </dl>
                  </div>
                </div>
                <table className="items-table">
                  <colgroup>
                    <col style={{ width: "5%" }} /><col style={{ width: "19%" }} /><col style={{ width: "21%" }} />
                    <col style={{ width: "7%" }} /><col style={{ width: "15%" }} /><col style={{ width: "16%" }} />
                    <col style={{ width: "17%" }} />
                  </colgroup>
                  <thead><tr><th>#</th><th>الصنف</th><th>الوصف</th><th>العدد</th><th>السعر السابق</th><th>السعر بعد الخصم</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {draft.items.map((item, index) => (
                      <tr key={index}>
                        <td className="row-number">{index + 1}</td>
                        <td><b>{item.name || "-"}</b></td><td>{item.description || "-"}</td>
                        <td>{item.qty || 0}</td>
                        <td>
                          {previousPrice(item) === null ? "-" : (
                            <>
                              <s className="old-price">{money(previousPrice(item)!)}</s>
                              <span className="discount-badge">خصم {discountPercent(item)}%</span>
                            </>
                          )}
                        </td>
                        <td>{money(item.price)}</td>
                        <td><b>{money((item.qty || 0) * (item.price || 0))}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="totals-row">
                  <div className="amount-words">
                    <span className="info-label">المبلغ كتابةً</span>
                    <p>{amountInWords(totals.grand)}</p>
                    {totals.discountTotal > 0 && (
                      <span className="savings-badge">وفّرت {money(totals.discountTotal)} ({savingsPercent}%)</span>
                    )}
                    <p className="validity">هذا العرض صالح لمدة {daysText(draft.validDays || 0)} من تاريخ الإصدار</p>
                  </div>
                  <div className="totals-card">
                    <div><span>المجموع قبل الخصم</span><b>{money(totals.subtotal)}</b></div>
                    <div className="discount-value"><span>قيمة الخصم</span><b>{totals.discountTotal > 0 ? `- ${money(totals.discountTotal)}` : money(0)}</b></div>
                    <div><span>المجموع بعد الخصم</span><b>{money(totals.afterDiscount)}</b></div>
                    <div><span>الضريبة ({draft.tax || 0}%)</span><b>{money(totals.taxAmount)}</b></div>
                    <div className="grand-total"><span>الإجمالي شامل الضريبة</span><b>{money(totals.grand)}</b></div>
                  </div>
                </div>
                <div className="notes">
                  <b>ملاحظات</b>
                  <ul>
                    {noteLines.map((line, index) => <li key={index}>{line}</li>)}
                  </ul>
                </div>
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
