export type ProductType = {
  itemId: string;
  asin: string;
  name: string;
  image: string;
  url: string;
  rating: number;
  description: string;
  suggestion: string;
  variant: string;
  type: string;
  rank: number;
  reasoning: string;
  analysisResult: {
    key: string;
  } | null;
  unitPrice: number;
};

export type SimplifiedProductType = {
  name: string;
  description: string;
  asin: string;
  rating: number;
};

type VariantLink = {
  itemId: string;
  asin: string;
  name: string;
  image: string;
  url: string;
  rating: number;
  description: string;
  unitPrice: number;
};

export type SuggestionVariant = {
  variant: string;
  links: VariantLink[];
  type: string;
  suggestion: string;
};
