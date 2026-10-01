import type { Severity } from "./types";
export const asset = (name: string) => `/assets/${name}.svg`;
export const icons = {
  home: asset("138-14604-imgHomeLine"),
  homeActive: asset("196-1527-imgIconHome"),
  allergens: asset("196-1527-imgShieldTick"),
  allergensActive: asset("136-13857-imgShieldTick"),
  profile: asset("196-1527-imgIconUser"),
  profileActive: asset("138-14604-imgIconProfile"),
  scan: asset("196-1527-imgScan"),
  edit: asset("196-1527-imgIconEdit"),
  share: "/assets/final-ui/iconExport.svg",
  down: asset("136-13857-imgIconChevronDown1"),
  back: asset("184-3338-imgIconChevronLeft"),
  close: asset("136-14216-imgIconClose1"),
  camera: asset("197-1781-imgIconCamera"),
  photo: asset("197-1781-imgIcImageon"),
  plus: asset("183-2448-imgIconPlus"),
  right: asset("183-2987-imgIconChevronRight"),
  bookmark: asset("138-14604-imgBookmark"),
  card: asset("138-14604-imgCreditCard02"),
  userEdit: asset("138-14604-imgUserEdit"),
  file: asset("138-14604-imgFile02"),
  logout: asset("138-14604-imgLogOut01"),
  logo: "/assets/final-ui/imgFrame4119.svg",
  logoGreen: "/assets/final-ui/imgSizeSmColorGreenAppNameFalse.svg",
  password: "/assets/final-ui/imgIconPassword.svg",
  trash: "/assets/final-ui/imgIconTrash.svg",
  settings: "/assets/settings.svg",
  list: asset("173-755-imgGroup9"),
};
export const groups = [
  { name: "Milk", items: ["Milk"], image: asset("196-1527-imgMilk"), mascot: "milk" },
  { name: "Eggs", items: ["Eggs"], image: asset("136-12404-imgEgg"), mascot: "eggs" },
  {
    name: "Cereals containing gluten",
    items: ["Wheat", "Rye", "Barley", "Oats"],
    image: asset("136-12402-imgWheat"),
    mascot: "gluten",
  },
  {
    name: "Peanuts & Tree Nuts",
    items: [
      "Peanuts",
      "Almonds",
      "Hazelnuts",
      "Walnuts",
      "Cashews",
      "Pecans",
      "Brazil nuts",
      "Pistachios",
      "Macadamia",
    ],
    image: asset("136-12406-imgPeanut"),
    mascot: "peanuts",
  },
  {
    name: "Fish, Crustaceans & Molluscs",
    items: ["Fish", "Crustaceans", "Molluscs"],
    image: asset("196-1527-imgFish"),
    mascot: "fish-shellfish",
  },
  {
    name: "Soybeans, Lupin & Sesame",
    items: ["Soybeans", "Lupin", "Sesame"],
    image: asset("136-12411-imgBean"),
    mascot: "soy-seeds",
  },
  {
    name: "Celery & Mustard",
    items: ["Celery", "Mustard"],
    image: "/assets/celery.png",
    mascot: "celery-mustard",
  },
  {
    name: "Sulphites",
    items: ["Sulphites"],
    image: asset("sources-imgSulphites"),
    mascot: "sulphites",
  },
];
export const allergenGroups = [
  ...groups.map(({name,items})=>({name,items})),
];
export function imageFor(name: string, severity: Severity | 'None' = 'Critical', size: 'Sm' | 'Md' | 'Lg' = 'Md') {
  const family = groups.find((group) => group.items.includes(name))?.mascot;
  const categories: Record<string, string> = {milk:'Milk',eggs:'Egg',gluten:'Gluten',peanuts:'Peanut','fish-shellfish':'Fish','soy-seeds':'Soy','celery-mustard':'Celery',sulphites:'Sulphites'};
  if (family && categories[family]) return `/assets/final-ui/imgSize${severity === 'None' ? 'Lg' : size}Severity${severity}Category${categories[family]}.svg`;
  return name === "Crustaceans"
    ? asset("196-1527-imgCrab")
    : groups.find((g) => g.items.includes(name))?.image || groups[0].image;
}
export function groupFor(name: string) {
  return groups.find((g) => g.items.includes(name))?.name || name;
}
export const severities: Severity[] = ["Critical", "Avoid", "Safe"];
