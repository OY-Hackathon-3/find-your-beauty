export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  url: string;
  thumbnailUrl: string;
}

export interface FacialMetric {
  label: string;
  score: number;
}

export interface BeautyState {
  originalImage: string | null;
  generatedImage: string | null;
  diagnosticImage: string | null;
  products: Product[];
  isLoading: boolean;
  error: string | null;
  lookDescription: string | null;
  diagnosticSummary: string | null;
  diagnosticMetrics: FacialMetric[];
}

export interface SharedData {
  desc: string;
  prods: Product[];
}
