// Arabic amount in words (تفقيط) in the form used on Saudi invoices:
// 805.5 -> "فقط ثمانمائة وخمسة ريال سعودي وخمسون هللة لا غير"

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

function belowThousand(value: number) {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest >= 20) {
    const ones = rest % 10;
    parts.push(ones ? `${ONES[ones]} و${TENS[Math.floor(rest / 10)]}` : TENS[Math.floor(rest / 10)]);
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]);
  } else if (rest) {
    parts.push(ONES[rest]);
  }
  return parts.join(" و");
}

// Scale words: [one, two, three-to-ten (plural), eleven-plus]
const SCALES: [number, [string, string, string, string]][] = [
  [1_000_000_000, ["مليار", "ملياران", "مليارات", "مليار"]],
  [1_000_000, ["مليون", "مليونان", "ملايين", "مليون"]],
  [1_000, ["ألف", "ألفان", "آلاف", "ألف"]],
];

function integerWords(value: number): string {
  if (value === 0) return "صفر";
  const parts: string[] = [];
  let rest = value;
  for (const [size, [one, two, plural, many]] of SCALES) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (!count) continue;
    if (count === 1) parts.push(one);
    else if (count === 2) parts.push(two);
    else if (count <= 10) parts.push(`${belowThousand(count)} ${plural}`);
    else parts.push(`${belowThousand(count)} ${many}`);
  }
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" و");
}

export function amountInWords(amount: number) {
  const halalas = Math.round(Math.max(Number(amount) || 0, 0) * 100);
  const riyals = Math.floor(halalas / 100);
  const fraction = halalas % 100;
  const fractionText = fraction ? ` و${integerWords(fraction)} هللة` : "";
  return `فقط ${integerWords(riyals)} ريال سعودي${fractionText} لا غير`;
}

// "3 أيام", "14 يومًا", following Arabic number agreement.
export function daysText(days: number) {
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  if (days >= 3 && days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}
