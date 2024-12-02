function isZeroDecimal(amount: number, currency: string) {
  let numberFormat = new Intl.NumberFormat(["en-US"], {
    style: "currency",
    currency: currency,
    currencyDisplay: "symbol",
  });
  const parts = numberFormat.formatToParts(amount);
  let zeroDecimalCurrency = true;
  for (let part of parts) {
    if (part.type === "decimal") {
      zeroDecimalCurrency = false;
    }
  }
  return zeroDecimalCurrency;
}

function formatAmountForStripe(amount: number, currency: string) {
  return isZeroDecimal(amount, currency) ? amount : Math.round(amount * 100);
}

export default formatAmountForStripe;
