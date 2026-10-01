export type Severity = "Critical" | "Avoid" | "Safe";
export type Preference = { name: string; severity: Severity };
export type Profile = {
  id?: string;
  avatar?: string;
  avatarOwnerId?: string;
  name: string;
  allergens: Preference[];
  completed: boolean;
};
export type Photo = {
  id: string;
  data: string;
  kind: "menu" | "legend" | "food";
  name: string;
};
export type Finding = {
  source?: 'legend' | 'menu' | 'ai';
  name: string;
  evidence: string;
  certainty: "declared" | "possible";
  severity: Severity | "Untracked";
};
export type Dish = {
  allergenCodes?: string[];
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  allergens: Finding[];
  uncertainties: string[];
  questions: string[];
  status: "Critical" | "Avoid" | "Uncertain";
};
export type Report = {
  legend?: {code:string;label:string;allergens:string[]}[];
  id: string;
  createdAt: string;
  model: string;
  sourceType: string;
  title: string;
  readable: boolean;
  allergenListText?: string;
  menuText?: string;
  extractedText?: string;
  summary: string;
  dishes: Dish[];
  warnings: string[];
  profileSnapshot: Preference[];
};
