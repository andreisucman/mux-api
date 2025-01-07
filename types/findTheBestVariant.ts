export type AnalyzedSuggestionType = {
  itemId: string;
  asin: string;
  name: string;
  url: string;
  type: "product" | "place";
  image: string;
  description: string;
  rating: number;
  suggestion: string;
  rank: number;
  reasoning: string;
  analysisResult: { [key: string]: boolean } | null;
  priceAndUnit: string;
  isVectorized: boolean;
};

export type VectorizedSuggestionType = {
  suggestionId: string;
  suggestionName: string;
  name: string;
  url: string;
  rating: number;
  priceAndUnit: string;
  embeddingText: string;
  embedding: number[];
  createdAt: Date;
};

export type SimplifiedProductType = {
  name: string;
  description: string;
  asin: string;
  rating: number;
};

export type SuggestionType = {
  _id: string;
  type: string;
  suggestion: "product" | "place";
  asin: string;
  name: string;
  image: string;
  url: string;
  rating: number;
  description: string;
  priceAndUnit: string;
  isVectorized: boolean;
};

export interface ValidatedSuggestionType extends SuggestionType {
  verdict: boolean;
}
