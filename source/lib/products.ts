// Ready-made packages the editor can add to a quote with one tap.
// Each line is an item: price is the unit price after discount; oldPrice is the previous price (0 = none).
// A line with qty 0 still shows in the quote (for example an add-on at its previous price).
export type ProductLine = {
  name: string;
  description: string;
  qty: number;
  oldPrice: number;
  price: number;
};

export type Product = {
  name: string;
  description: string;
  lines: ProductLine[];
  // VAT % the quote switches to when the package is added.
  tax: number;
};

export const PRODUCTS: Product[] = [
  {
    name: "باقة سنتين",
    description: "اشتراك سنتين مع كاشير تابلت متنقل وطابعة حرارية",
    lines: [
      { name: "اشتراك سنتين", description: "-", qty: 1, oldPrice: 8209.03, price: 4104.35 },
      { name: "كاشير تابلت متنقل", description: "-", qty: 0, oldPrice: 750, price: 0 },
      { name: "طابعة حراريه", description: "-", qty: 0, oldPrice: 399, price: 0 },
    ],
    tax: 15,
  },
];

// Total after discount, with the package's VAT.
export const productTotal = (product: Product) =>
  (product.lines.reduce((sum, line) => sum + line.qty * line.price, 0) * (100 + product.tax)) / 100;
