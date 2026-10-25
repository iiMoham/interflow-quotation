// Quote numbers display as "QT-0063". Older quotes were saved as "#Qut0063".
export const formatQuoteNumber = (id: number) => `QT-${String(id).padStart(4, "0")}`;

export const normalizeQuoteNumber = (value: string) => {
  const legacy = /^#Qut(\d+)$/.exec(value.trim());
  return legacy ? formatQuoteNumber(Number(legacy[1])) : value;
};
