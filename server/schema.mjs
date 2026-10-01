import { z } from "zod";
export const allergenNames = [
  "Milk",
  "Eggs",
  "Wheat",
  "Rye",
  "Barley",
  "Oats",
  "Peanuts",
  "Almonds",
  "Hazelnuts",
  "Walnuts",
  "Cashews",
  "Pecans",
  "Brazil nuts",
  "Pistachios",
  "Macadamia",
  "Fish",
  "Crustaceans",
  "Molluscs",
  "Soybeans",
  "Lupin",
  "Sesame",
  "Mustard",
  "Celery",
  "Sulphites",
];
export const profileSchema = z
  .array(
    z.object({
      name: z.enum(allergenNames),
      severity: z.enum(["Critical", "Avoid", "Safe"]),
    }),
  )
  .max(24)
  .refine(
    (a) => new Set(a.map((x) => x.name)).size === a.length,
    "Duplicate allergens",
  );
const imageSchema = z.object({
  data: z
    .string()
    .max(7_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/),
  kind: z.enum(["menu", "legend", "food"]),
});
export const requestSchema = z
  .object({
    images: z.array(imageSchema).max(6),
    text: z.string().max(20000).default(""),
    profile: profileSchema,
    guestToken: z.string().max(1000).optional(),
  })
  .refine(
    (x) => x.images.length > 0 || x.text.trim().length > 0,
    "Add photos or menu text",
  );
export const reportSchema = z.object({
  sourceType: z.enum(["menu", "label", "food_photo", "text", "unreadable"]),
  title: z.string().min(1).max(200),
  readable: z.boolean(),
  allergenListText: z.string().max(30000),
  menuText: z.string().max(30000),
  summary: z.string().max(2000),
  legend: z.array(z.object({code:z.string().min(1).max(30),label:z.string().min(1).max(300),allergens:z.array(z.enum(allergenNames)).max(24)})).max(100),
  dishes: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        allergenCodes: z.array(z.string().min(1).max(30)).max(100),
        description: z.string().max(1000),
        ingredients: z.array(z.string().max(100)).max(60),
        allergens: z
          .array(
            z.object({
              name: z.enum(allergenNames),
              evidence: z.string().max(800),
              certainty: z.enum(["declared", "possible"]),
            }),
          )
          .max(24),
        uncertainties: z.array(z.string().max(500)).max(20),
        questions: z.array(z.string().max(500)).max(10),
      }),
    )
    .max(100),
  warnings: z.array(z.string().max(1000)).max(20),
});
export const jsonSchema = z.toJSONSchema(reportSchema);
delete jsonSchema.$schema;
export const SAFETY_NOTE =
  "AI can miss ingredients and cannot detect cross-contact. Confirm ingredients and preparation with staff or the manufacturer before eating.";
export function personalize(report, profile) {
  return {
    ...report,
    warnings: [...new Set([SAFETY_NOTE, ...report.warnings])],
    profileSnapshot: profile,
    dishes: report.dishes.map((dish, i) => {
      const findings = new Map(dish.allergens.map(a=>[a.name,{...a,source:a.certainty==='declared'?'menu':'ai'}]));
      const uncertainties = [...dish.uncertainties];
      for(const code of dish.allergenCodes||[]) {
        const matches=(report.legend||[]).filter(entry=>entry.code.trim()===code.trim());
        const mappings=new Set(matches.map(entry=>[...entry.allergens].sort().join('|')));
        if(matches.length && mappings.size===1 && matches[0].allergens.length) {
          const entry=matches[0];
          for(const name of entry.allergens) findings.set(name,{name,certainty:'declared',source:'legend',evidence:`Menu code ${code}: ${entry.label}`});
        } else uncertainties.push(`Allergen code “${code}” could not be matched unambiguously to the supplied allergen list. Confirm it with staff.`);
      }
      const allergens = [...findings.values()].map((a) => ({
        ...a,
        severity:
          profile.find((p) => p.name === a.name)?.severity ?? "Untracked",
      }));
      // No negative inference: absence of detected allergens never establishes safety.
      const status = allergens.some((a) => a.severity === "Critical")
        ? "Critical"
        : allergens.some((a) => a.severity === "Avoid")
          ? "Avoid"
          : "Uncertain";
      return { ...dish, uncertainties:[...new Set(uncertainties)], id: String(i + 1), allergens, status };
    }),
  };
}
