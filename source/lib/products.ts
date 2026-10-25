// Ready-made products the editor can add to a quote with one tap.
// price is the price after discount; oldPrice is the previous price (0 = none).
export type Product = {
  name: string;
  description: string;
  oldPrice: number;
  price: number;
};

export const PRODUCTS: Product[] = [
  {
    name: "باقة سنتين",
    description: "اشتراك لمدة سنتين شامل الأجهزة",
    oldPrice: 5520,
    price: 4720,
  },
];
