import { amountInWords, daysText } from "./tafqit";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_WIDTH = 794;
const RENDER_SCALE = 3;

type QuoteItem = {
  name: string;
  description: string;
  qty: number;
  oldPrice: number;
  price: number;
};

type QuoteBrand = {
  label: string;
  logo: string;
  stamp: string;
  accent: string;
  dark: string;
  domain: string;
  email: string;
};

export type QuotePdfData = {
  platform: "interflow" | "roduod";
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
  items: QuoteItem[];
  totals: {
    subtotal: number;
    discountTotal: number;
    afterDiscount: number;
    taxAmount: number;
    grand: number;
  };
  brand: QuoteBrand;
};

const encode = (value: string) => new TextEncoder().encode(value);
// Same stack as the page; Thmanyah Sans only renders where it is installed (see brand.css).
const fontFamily = '"Thmanyah Sans", Tahoma, Arial, sans-serif';

// Canvas text doesn't wait for fonts, so load every weight the PDF draws with first.
async function loadPdfFonts() {
  await Promise.all(["400", "700", "800"].map((weight) => document.fonts.load(`${weight} 13px ${fontFamily}`)));
}

const money = (value: number) => {
  const amount = value || 0;
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: 2 }).format(amount)} ريال`;
};

const displayDate = (value: string) => (value ? value.replaceAll("-", "/") : "-");

const previousPrice = (item: QuoteItem) =>
  (Number(item.oldPrice) || 0) > (Number(item.price) || 0) ? Number(item.oldPrice) : null;

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
}

function drawImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = String(value || "-").replaceAll("\r", "").split("\n");

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }

    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
  });

  return lines.length ? lines : ["-"];
}

function clippedText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const text = String(value || "-");
  if (context.measureText(text).width <= maxWidth) return text;

  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

const INK = "#171829";
const MUTED = "#6b7280";
const CARD_BORDER = "#e3e7ee";
const CARD_SURFACE = "#fafbfc";
const DISCOUNT_RED = "#b42318";

async function renderQuotation(data: QuotePdfData) {
  const [logo, stamp] = await Promise.all([
    loadImage(data.brand.logo),
    loadImage(data.brand.stamp),
    loadPdfFonts(),
  ]);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("تعذر تجهيز ملف PDF");

  const rows = data.items.length ? data.items : [{ name: "-", description: "-", qty: 0, oldPrice: 0, price: 0 }];
  const hasDiscount = data.totals.discountTotal > 0;

  // Vertical layout, top to bottom.
  const cardsTop = 186;
  const cardsHeight = 122;
  const tableTop = cardsTop + cardsHeight + 22;
  const tableHeaderHeight = 40;
  const tableRowHeight = 46;
  const tableBottom = tableTop + tableHeaderHeight + rows.length * tableRowHeight;

  const totalsTop = tableBottom + 20;
  const totalsRowHeight = 30;
  const totalsRows: [string, string, string?][] = [
    ["المجموع قبل الخصم", money(data.totals.subtotal)],
    ["قيمة الخصم", hasDiscount ? `- ${money(data.totals.discountTotal)}` : money(0), DISCOUNT_RED],
    ["المجموع بعد الخصم", money(data.totals.afterDiscount)],
    [`الضريبة (${data.tax || 0}%)`, money(data.totals.taxAmount)],
  ];
  const grandHeight = 46;
  const totalsCardHeight = totalsRows.length * totalsRowHeight + grandHeight;

  measureContext.font = `700 13px ${fontFamily}`;
  const wordsLines = wrapText(measureContext, amountInWords(data.totals.grand), 340);
  const validityY = totalsTop + 38 + wordsLines.length * 21;

  // Right column: notes sit under the amount in words. Left column: stamp under the totals.
  const notesX = 394;
  const notesWidth = 360;
  measureContext.font = `13px ${fontFamily}`;
  const noteRows = (data.notes || "-")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => wrapText(measureContext, line, notesWidth - 42).map((text, index) => ({ text, bullet: index === 0 })));
  if (!noteRows.length) noteRows.push({ text: "-", bullet: true });
  const notesTop = validityY + 16;
  const notesBottom = notesTop + 44 + noteRows.length * 20;

  // The stamp centres in the space between the totals card and the footer, at least 28px clear of both.
  const totalsCardBottom = totalsTop + totalsCardHeight;
  const stampHeight = data.platform === "interflow" ? 115 : 155;
  const stampGap = 28;
  const stampCenterX = 40 + 330 / 2;
  const contentBottom = Math.max(notesBottom, totalsCardBottom + stampGap + stampHeight);
  const footerTop = Math.max(1059, contentBottom + stampGap);
  const stampTop = totalsCardBottom + (footerTop - totalsCardBottom - stampHeight) / 2;
  const pageHeight = footerTop + 64;

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH * RENDER_SCALE;
  canvas.height = pageHeight * RENDER_SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز ملف PDF");
  context.scale(RENDER_SCALE, RENDER_SCALE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, pageHeight);
  context.textBaseline = "alphabetic";
  context.direction = "rtl";

  // Header
  context.fillStyle = data.brand.dark;
  context.fillRect(0, 0, PAGE_WIDTH, 90);
  if (data.platform === "roduod") {
    context.fillStyle = "#ffffff";
    roundedRect(context, 608, 17, 152, 56, 9);
    context.fill();
  }
  if (logo) drawImageContain(context, logo, 614, 20, 140, 50);

  context.fillStyle = "#ffffff";
  context.font = `700 16px ${fontFamily}`;
  context.textAlign = "center";
  context.fillText("شركة القائمة الرقمية لتقنية المعلومات", PAGE_WIDTH / 2, 51);
  context.font = `700 13px ${fontFamily}`;
  context.textAlign = "left";
  context.fillText(data.brand.domain, 34, 51);

  // Title row: status title and QUOTATION on the right, a fading accent rule to the left.
  const title = data.status || "عرض سعر";
  context.fillStyle = data.brand.accent;
  context.font = `800 36px ${fontFamily}`;
  context.textAlign = "right";
  context.fillText(title, 754, 140);
  const titleWidth = context.measureText(title).width;

  context.fillStyle = "#8a91a0";
  context.font = `700 11px ${fontFamily}`;
  context.direction = "ltr";
  context.letterSpacing = "4.4px";
  // Letter spacing trails the last letter, so shift right by one gap to stay flush.
  context.fillText("QUOTATION", 754 + 4.4, 160);
  const subtitleWidth = context.measureText("QUOTATION").width;
  context.letterSpacing = "0px";
  context.direction = "rtl";

  const ruleRight = 754 - Math.max(titleWidth, subtitleWidth) - 18;
  const rule = context.createLinearGradient(ruleRight, 0, 40, 0);
  rule.addColorStop(0, data.brand.accent);
  rule.addColorStop(1, `${data.brand.accent}00`);
  context.fillStyle = rule;
  roundedRect(context, 40, 136, ruleRight - 40, 2, 1);
  context.fill();

  // Client and quote detail cards
  const cardWidth = (714 - 12) / 2;
  const clientX = 754 - cardWidth;
  const detailsX = 40;
  [clientX, detailsX].forEach((x) => {
    context.fillStyle = CARD_SURFACE;
    context.strokeStyle = CARD_BORDER;
    context.lineWidth = 1;
    roundedRect(context, x, cardsTop, cardWidth, cardsHeight, 10);
    context.fill();
    context.stroke();
  });

  context.textAlign = "right";
  context.fillStyle = data.brand.accent;
  context.font = `800 12px ${fontFamily}`;
  context.fillText("مقدَّم إلى", clientX + cardWidth - 14, cardsTop + 24);
  context.fillText("تفاصيل العرض", detailsX + cardWidth - 14, cardsTop + 24);

  context.fillStyle = INK;
  context.font = `800 17px ${fontFamily}`;
  context.fillText(clippedText(context, data.clientName || "اسم العميل", cardWidth - 28), clientX + cardWidth - 14, cardsTop + 54);
  if (data.clientNumber) {
    context.fillStyle = "#4b5262";
    context.font = `13px ${fontFamily}`;
    context.fillText(
      clippedText(context, `الرقم الضريبي / السجل: ${data.clientNumber}`, cardWidth - 28),
      clientX + cardWidth - 14,
      cardsTop + 80,
    );
  }

  [
    ["رقم العرض", data.quoteNumber || "..."],
    ["تاريخ الإصدار", displayDate(data.issueDate)],
    ["صالح حتى", displayDate(data.expiryDate)],
    ["حالة الطلب", data.status || "-"],
  ].forEach(([label, value], index) => {
    const y = cardsTop + 50 + index * 20;
    context.textAlign = "right";
    context.fillStyle = MUTED;
    context.font = `13px ${fontFamily}`;
    context.fillText(label, detailsX + cardWidth - 14, y);
    context.textAlign = "left";
    context.fillStyle = index === 0 ? data.brand.dark : INK;
    context.font = `${index === 0 ? "800" : "700"} 13px ${fontFamily}`;
    context.fillText(value, detailsX + 14, y);
  });

  // Items table, ordered visually from left to right so the item name lands on the right.
  const tableX = 40;
  const columns = [
    { title: "الإجمالي", width: 116 },
    { title: "السعر بعد الخصم", width: 112 },
    { title: "السعر السابق", width: 112 },
    { title: "العدد", width: 52 },
    { title: "الوصف", width: 150 },
    { title: "الصنف", width: 136 },
    { title: "#", width: 36 },
  ];
  const oldPriceColumn = 2;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const tableHeight = tableBottom - tableTop;

  context.save();
  roundedRect(context, tableX, tableTop, tableWidth, tableHeight, 10);
  context.clip();
  context.fillStyle = data.brand.accent;
  context.fillRect(tableX, tableTop, tableWidth, tableHeaderHeight);
  rows.forEach((_, rowIndex) => {
    context.fillStyle = rowIndex % 2 ? "#f7f9fb" : "#ffffff";
    context.fillRect(tableX, tableTop + tableHeaderHeight + rowIndex * tableRowHeight, tableWidth, tableRowHeight);
  });
  context.lineWidth = 1;
  let columnX = tableX;
  columns.slice(0, -1).forEach((column) => {
    columnX += column.width;
    context.strokeStyle = "rgb(255 255 255 / 35%)";
    context.beginPath();
    context.moveTo(columnX, tableTop);
    context.lineTo(columnX, tableTop + tableHeaderHeight);
    context.stroke();
    context.strokeStyle = "#eef0f4";
    context.beginPath();
    context.moveTo(columnX, tableTop + tableHeaderHeight);
    context.lineTo(columnX, tableBottom);
    context.stroke();
  });
  context.strokeStyle = "#e6e9ef";
  rows.slice(1).forEach((_, rowIndex) => {
    const y = tableTop + tableHeaderHeight + (rowIndex + 1) * tableRowHeight;
    context.beginPath();
    context.moveTo(tableX, y);
    context.lineTo(tableX + tableWidth, y);
    context.stroke();
  });
  context.restore();
  context.strokeStyle = "#dfe4ea";
  context.lineWidth = 1;
  roundedRect(context, tableX, tableTop, tableWidth, tableHeight, 10);
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.font = `800 13px ${fontFamily}`;
  columnX = tableX;
  columns.forEach((column) => {
    context.fillText(column.title, columnX + column.width / 2, tableTop + tableHeaderHeight / 2);
    columnX += column.width;
  });

  rows.forEach((item, rowIndex) => {
    const centerY = tableTop + tableHeaderHeight + rowIndex * tableRowHeight + tableRowHeight / 2;
    const oldPrice = previousPrice(item);
    const values = [
      money((Number(item.qty) || 0) * (Number(item.price) || 0)),
      money(Number(item.price) || 0),
      oldPrice === null ? "-" : money(oldPrice),
      String(Number(item.qty) || 0),
      item.description || "-",
      item.name || "-",
      String(rowIndex + 1),
    ];
    let cellX = tableX;
    values.forEach((value, index) => {
      const centerX = cellX + columns[index].width / 2;
      const bold = index === 0 || index === 5 || index === 6;
      context.font = `${bold ? "700" : "400"} 13px ${fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const text = clippedText(context, value, columns[index].width - 12);
      if (index === oldPriceColumn && oldPrice !== null) {
        context.fillStyle = MUTED;
        context.fillText(text, centerX, centerY);
        const halfWidth = context.measureText(text).width / 2;
        context.strokeStyle = MUTED;
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(centerX - halfWidth, centerY);
        context.lineTo(centerX + halfWidth, centerY);
        context.stroke();
      } else {
        context.fillStyle = index === 6 ? "#8a91a0" : INK;
        context.fillText(text, centerX, centerY);
      }
      cellX += columns[index].width;
    });
  });

  // Totals card on the left
  const totalsX = 40;
  const totalsWidth = 330;
  context.fillStyle = "#ffffff";
  context.strokeStyle = CARD_BORDER;
  context.lineWidth = 1;
  roundedRect(context, totalsX, totalsTop, totalsWidth, totalsCardHeight, 10);
  context.fill();
  context.textBaseline = "middle";
  totalsRows.forEach(([label, value, color], index) => {
    const y = totalsTop + index * totalsRowHeight;
    if (index) {
      context.strokeStyle = "#eef0f4";
      context.beginPath();
      context.moveTo(totalsX, y);
      context.lineTo(totalsX + totalsWidth, y);
      context.stroke();
    }
    context.textAlign = "right";
    context.fillStyle = INK;
    context.font = `13px ${fontFamily}`;
    context.fillText(label, totalsX + totalsWidth - 14, y + totalsRowHeight / 2);
    context.textAlign = "left";
    context.fillStyle = color ?? INK;
    context.font = `700 13px ${fontFamily}`;
    context.fillText(value, totalsX + 14, y + totalsRowHeight / 2);
  });
  const grandTop = totalsTop + totalsRows.length * totalsRowHeight;
  context.save();
  roundedRect(context, totalsX, totalsTop, totalsWidth, totalsCardHeight, 10);
  context.clip();
  context.fillStyle = data.brand.dark;
  context.fillRect(totalsX, grandTop, totalsWidth, grandHeight);
  context.restore();
  context.strokeStyle = CARD_BORDER;
  roundedRect(context, totalsX, totalsTop, totalsWidth, totalsCardHeight, 10);
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `800 15px ${fontFamily}`;
  context.textAlign = "right";
  context.fillText("الإجمالي شامل الضريبة", totalsX + totalsWidth - 14, grandTop + grandHeight / 2);
  context.textAlign = "left";
  context.fillText(money(data.totals.grand), totalsX + 14, grandTop + grandHeight / 2);

  // Amount in words and validity on the right
  context.textBaseline = "alphabetic";
  context.textAlign = "right";
  context.fillStyle = data.brand.accent;
  context.font = `800 12px ${fontFamily}`;
  context.fillText("المبلغ كتابةً", 754, totalsTop + 16);
  context.fillStyle = INK;
  context.font = `700 13px ${fontFamily}`;
  wordsLines.forEach((line, index) => context.fillText(line, 754, totalsTop + 37 + index * 21));
  context.fillStyle = MUTED;
  context.font = `12px ${fontFamily}`;
  context.fillText(`هذا العرض صالح لمدة ${daysText(data.validDays || 0)} من تاريخ الإصدار`, 754, validityY);

  // Notes
  context.fillStyle = CARD_SURFACE;
  roundedRect(context, notesX, notesTop, notesWidth, notesBottom - notesTop, 10);
  context.fill();
  context.fillStyle = INK;
  context.font = `800 13px ${fontFamily}`;
  context.fillText("ملاحظات", 740, notesTop + 26);
  context.font = `13px ${fontFamily}`;
  noteRows.forEach(({ text, bullet }, index) => {
    const y = notesTop + 50 + index * 20;
    if (bullet) {
      context.fillStyle = data.brand.accent;
      context.fillText("•", 740, y);
    }
    context.fillStyle = INK;
    context.fillText(text, 726, y);
  });

  if (stamp) {
    if (data.platform === "interflow") {
      context.save();
      context.beginPath();
      context.rect(stampCenterX - 95, stampTop, 190, 115);
      context.clip();
      drawImageContain(context, stamp, stampCenterX - 95, stampTop - 34, 190, 190);
      context.restore();
    } else {
      drawImageContain(context, stamp, stampCenterX - 155, stampTop, 310, 155);
    }
  }

  // Footer
  context.fillStyle = data.brand.dark;
  context.fillRect(0, footerTop, PAGE_WIDTH, 64);
  context.fillStyle = "#ffffff";
  context.font = `12px ${fontFamily}`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.direction = "ltr";
  context.fillText(data.brand.domain, 54, footerTop + 32);
  context.textAlign = "center";
  context.fillText(data.brand.email, PAGE_WIDTH / 2, footerTop + 32);
  context.textAlign = "right";
  context.direction = "rtl";
  context.fillText("سجل تجاري: 7051649650", 740, footerTop + 32);

  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("تعذر إنشاء ملف PDF"))),
      "image/jpeg",
      0.94,
    );
  });

  return {
    bytes: new Uint8Array(await jpeg.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

function makePdf(jpeg: Uint8Array, imageWidth: number, imageHeight: number) {
  const chunks: Uint8Array[] = [];
  const offsets = new Array<number>(6).fill(0);
  let byteLength = 0;

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? encode(chunk) : chunk;
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  const startObject = (number: number) => {
    offsets[number] = byteLength;
    push(`${number} 0 obj\n`);
  };
  const endObject = () => push("\nendobj\n");

  push("%PDF-1.4\n%Direct PDF export\n");

  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>");
  endObject();

  startObject(2);
  push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  endObject();

  startObject(3);
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] ` +
      "/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
  );
  endObject();

  const scale = Math.min(A4_WIDTH / imageWidth, A4_HEIGHT / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (A4_WIDTH - drawWidth) / 2;
  const drawY = (A4_HEIGHT - drawHeight) / 2;
  const content = encode(
    `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${drawX.toFixed(3)} ${drawY.toFixed(3)} cm\n/Im0 Do\nQ\n`,
  );

  startObject(4);
  push(`<< /Length ${content.length} >>\nstream\n`);
  push(content);
  push("endstream");
  endObject();

  startObject(5);
  push(
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream");
  endObject();

  const xrefOffset = byteLength;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdf = new Uint8Array(byteLength);
  let cursor = 0;
  chunks.forEach((chunk) => {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  });
  return pdf;
}

export async function downloadQuoteAsPdf(data: QuotePdfData, filename: string) {
  const rendered = await renderQuotation(data);
  const pdf = makePdf(rendered.bytes, rendered.width, rendered.height);
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
