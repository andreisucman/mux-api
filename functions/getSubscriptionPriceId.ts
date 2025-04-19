import doWithRetries from "@/helpers/doWithRetries.js";
import formatAmountForStripe from "@/helpers/formatAmountForStripe.js";
import httpError from "@/helpers/httpError.js";
import { db, stripe } from "@/init.js";

type Props = {
  amount: number;
};

export default async function getSubscriptionPriceId({ amount }: Props) {
  try {
    const formattedAmount = formatAmountForStripe(amount, "usd");

    let priceId = null;

    const storedPrice = await doWithRetries(() => db.collection("StripePrice").findOne({ amount: formattedAmount }));

    priceId = storedPrice?.priceId;

    if (!priceId) {
      const interval = "month";

      const price = await stripe.prices.create({
        unit_amount: formattedAmount,
        currency: "usd",
        recurring: { interval },
        product_data: {
          name: "routines updates",
        },
      });

      await doWithRetries(() =>
        db.collection("StripePrice").insertOne({
          amount: formattedAmount,
          priceId: price.id,
        })
      );

      priceId = price.id;
    }

    return priceId;
  } catch (err) {
    throw httpError(err);
  }
}
