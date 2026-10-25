const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_WIDTH = 794;
const RENDER_SCALE = 2;

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
const fontFamily = 'Tahoma, Arial, sans-serif';

const money = (value: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value || 0)} ريال`;

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

async function renderQuotation(data: QuotePdfData) {
  const [logo, stamp] = await Promise.all([loadImage(data.brand.logo), loadImage(data.brand.stamp)]);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("تعذر تجهيز ملف PDF");

  const rows = data.items.length ? data.items : [{ name: "-", description: "-", qty: 0, oldPrice: 0, price: 0 }];
  const tableTop = 360;
  const tableHeaderHeight = 44;
  const tableRowHeight = 46;
  const tableBottom = tableTop + tableHeaderHeight + rows.length * tableRowHeight;
  const summaryTop = tableBottom + 22;
  const summaryRowCount = 4;
  const grandTop = summaryTop + summaryRowCount * 25 + 5;
  const grandBottom = grandTop + 48;
  const validityY = grandBottom + 34;
  const notesTop = validityY + 32;

  measureContext.font = `13px ${fontFamily}`;
  const noteLines = wrapText(measureContext, data.notes, 674);
  const notesBottom = notesTop + 31 + noteLines.length * 19;
  const stampTop = notesBottom + 8;
  const stampHeight = data.platform === "interflow" ? 115 : 155;
  const footerTop = Math.max(1059, stampTop + stampHeight + 20);
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

  // Metadata
  context.fillStyle = "#171829";
  context.font = `14px ${fontFamily}`;
  context.textAlign = "right";
  context.fillText(`تاريخ الإصدار: ${displayDate(data.issueDate)}`, 754, 126);
  context.fillText(`صالح حتى: ${displayDate(data.expiryDate)}`, 754, 152);
  context.fillText(`حالة الطلب: ${data.status || "-"}`, 754, 178);

  // Dynamic quote heading: it mirrors the status field.
  context.fillStyle = data.brand.accent;
  context.font = `800 42px ${fontFamily}`;
  context.textAlign = "center";
  context.fillText(data.status || "عرض سعر", PAGE_WIDTH / 2, 235);

  context.fillStyle = "#171829";
  context.font = `800 27px ${fontFamily}`;
  context.direction = "ltr";
  const quoteNumber = data.quoteNumber || "...";
  context.fillText(quoteNumber, PAGE_WIDTH / 2, 278);
  const numberWidth = context.measureText(quoteNumber).width;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(PAGE_WIDTH / 2 - numberWidth / 2, 283);
  context.lineTo(PAGE_WIDTH / 2 + numberWidth / 2, 283);
  context.stroke();

  context.direction = "rtl";
  context.font = `800 18px ${fontFamily}`;
  context.fillText(data.clientName || "اسم العميل", PAGE_WIDTH / 2, 316);
  context.font = `14px ${fontFamily}`;
  context.direction = "ltr";
  context.fillText(data.clientNumber || "", PAGE_WIDTH / 2, 340);
  context.direction = "rtl";

  // Items table, ordered visually from left to right so the item name lands on the right.
  const tableX = 40;
  const columns = [
    { title: "الإجمالي", width: 120 },
    { title: "السعر بعد الخصم", width: 126 },
    { title: "السعر السابق", width: 112 },
    { title: "العدد", width: 56 },
    { title: "الوصف", width: 150 },
    { title: "الصنف", width: 150 },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  context.fillStyle = data.brand.accent;
  context.fillRect(tableX, tableTop, tableWidth, tableHeaderHeight);
  context.strokeStyle = data.brand.dark;
  context.lineWidth = 2;
  context.strokeRect(tableX, tableTop, tableWidth, tableHeaderHeight + rows.length * tableRowHeight);

  let columnX = tableX;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.font = `800 13px ${fontFamily}`;
  columns.forEach((column, index) => {
    context.fillText(column.title, columnX + column.width / 2, tableTop + tableHeaderHeight / 2);
    columnX += column.width;
    if (index < columns.length - 1) {
      context.beginPath();
      context.moveTo(columnX, tableTop);
      context.lineTo(columnX, tableBottom);
      context.stroke();
    }
  });

  rows.forEach((item, rowIndex) => {
    const y = tableTop + tableHeaderHeight + rowIndex * tableRowHeight;
    context.fillStyle = "#ffffff";
    context.fillRect(tableX, y, tableWidth, tableRowHeight);
    context.beginPath();
    context.moveTo(tableX, y);
    context.lineTo(tableX + tableWidth, y);
    context.stroke();

    const oldPrice = previousPrice(item);
    const values = [
      money((Number(item.qty) || 0) * (Number(item.price) || 0)),
      money(Number(item.price) || 0),
      oldPrice === null ? "-" : money(oldPrice),
      String(Number(item.qty) || 0),
      item.description || "-",
      item.name || "-",
    ];
    const oldPriceColumn = 2;
    let cellX = tableX;
    values.forEach((value, index) => {
      const struck = index === oldPriceColumn && oldPrice !== null;
      const text = clippedText(context, value, columns[index].width - 12);
      const centerX = cellX + columns[index].width / 2;
      const centerY = y + tableRowHeight / 2;
      context.fillStyle = struck ? "#6b7280" : "#171829";
      context.font = `${index === 0 || index === 5 ? "700" : "400"} 13px ${fontFamily}`;
      context.fillText(text, centerX, centerY);
      if (struck) {
        const halfWidth = context.measureText(text).width / 2;
        context.strokeStyle = "#6b7280";
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(centerX - halfWidth, centerY);
        context.lineTo(centerX + halfWidth, centerY);
        context.stroke();
        context.strokeStyle = data.brand.dark;
        context.lineWidth = 2;
      }
      cellX += columns[index].width;
    });
  });

  context.textBaseline = "alphabetic";
  context.textAlign = "right";
  context.font = `700 14px ${fontFamily}`;
  const summaryRows = [
    ["المجموع قبل الخصم:", money(data.totals.subtotal)],
    [
      "قيمة الخصم:",
      data.totals.discountTotal > 0 ? `- ${money(data.totals.discountTotal)}` : money(0),
      "#b42318",
    ],
    ["المجموع بعد الخصم:", money(data.totals.afterDiscount)],
    [`الضريبة (${data.tax || 0}%):`, money(data.totals.taxAmount)],
  ];
  summaryRows.forEach(([label, value, valueColor], index) => {
    const y = summaryTop + index * 25;
    context.fillStyle = "#171829";
    context.textAlign = "right";
    context.fillText(label, 754, y + 15);
    context.textAlign = "left";
    context.fillStyle = valueColor ?? "#171829";
    context.fillText(value, 40, y + 15);
  });

  context.fillStyle = data.brand.dark;
  roundedRect(context, 40, grandTop, 714, 48, 8);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = `800 16px ${fontFamily}`;
  context.textAlign = "right";
  context.fillText("الإجمالي شامل الضريبة:", 738, grandTop + 30);
  context.textAlign = "left";
  context.fillText(money(data.totals.grand), 56, grandTop + 30);

  context.fillStyle = "#6b7280";
  context.font = `13px ${fontFamily}`;
  context.textAlign = "center";
  context.fillText(
    `هذا العرض صالح لمدة ${data.validDays || 0} أيام من تاريخ الإصدار`,
    PAGE_WIDTH / 2,
    validityY,
  );

  context.strokeStyle = "#edf0f3";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(40, notesTop);
  context.lineTo(754, notesTop);
  context.stroke();
  context.fillStyle = "#171829";
  context.font = `700 13px ${fontFamily}`;
  context.textAlign = "right";
  context.fillText("ملاحظة:", 754, notesTop + 22);
  context.font = `13px ${fontFamily}`;
  noteLines.forEach((line, index) => context.fillText(line || " ", 754, notesTop + 45 + index * 19));

  if (stamp) {
    if (data.platform === "interflow") {
      context.save();
      context.beginPath();
      context.rect(PAGE_WIDTH / 2 - 95, stampTop, 190, 115);
      context.clip();
      drawImageContain(context, stamp, PAGE_WIDTH / 2 - 95, stampTop - 34, 190, 190);
      context.restore();
    } else {
      drawImageContain(context, stamp, PAGE_WIDTH / 2 - 155, stampTop, 310, 155);
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
