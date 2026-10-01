import {Navigation} from './components';
import {ProfileHeading} from './ProfileViews';
const art=(name:string)=>`/assets/data-resources/${name}.svg`;
const mascot=(category:string)=>`/assets/final-ui/imgSizeSmSeveritySafeCategory${category}.svg`;
const eu='https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02011R1169-20250401';
const fda='https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies';
const classification=[
 {name:'Milk',image:'Milk',items:['Milk, includes lactose, butter, cream, cheese, whey']},
 {name:'Eggs',image:'Egg',items:[]},
 {name:'Cereals containing gluten',image:'Gluten',items:['Wheat, includes spelt, khorasan','Rye','Barley','Oats']},
 {name:'Peanuts & tree nuts',image:'Peanut',items:['Peanuts','Almonds','Hazelnuts','Walnuts','Cashews','Pecans','Brazil nuts','Pistachios','Macadamia']},
 {name:'Fish & shellfish',image:'Fish',items:['Fish','Crustaceans: shrimp, crab, lobster','Molluscs: mussels, squid, oysters']},
 {name:'Soy, lupin & sesame',image:'Soy',items:['Soybeans','Lupin','Sesame']},
 {name:'Celery & mustard',image:'Celery',items:['Celery','Mustard']},
 {name:'Sulphites',image:'Sulphites',items:['Sulphur dioxide & sulphites: EU declaration applies above 10 mg/kg or 10 mg/litre, expressed as total SO₂. Common in wine, dried fruit and pickled foods.']},
];
export default function DataSources({avatar,navigate,onBack}:{avatar?:string;navigate:(s:string)=>void;onBack:()=>void}) {
 return <div className="page profile-detail"><ProfileHeading title="Data Sources" backLabel="Profile" avatar={avatar} onBack={onBack}/><div className="scroll-body sources-body">
 <section className="sources-section"><h2><img src={art('check-board')} alt=""/>Allergen Coverage</h2>
 <p>YOEO checks the 14 allergen categories defined by <a href={eu} target="_blank" rel="noreferrer">EU Regulation 1169/2011 (Annex II)</a>.</p>
 <p>This also covers all nine major allergens recognised by the <a href={fda} target="_blank" rel="noreferrer">US FDA (the “Big 9”)</a>. Wheat is included here under Cereals containing gluten.</p>
 <div className="source-citations">{[{label:'Allergen standard',name:'EU 1169/2011, Annex II',url:eu},{label:'US coverage',name:'FDA Big 9',url:fda}].map(c=><a key={c.label} href={c.url} target="_blank" rel="noreferrer"><span>{c.label}</span><span>{c.name}</span><img src={art('arrow-right')} alt="Opens in a new tab"/></a>)}</div></section>
 <section className="sources-section sources-classification"><h2><img src={art('list')} alt=""/>Allergen Classification</h2>{classification.map(c=><section className="classification-card" key={c.name}><h3><img src={mascot(c.image)} alt=""/>{c.name}</h3>{c.items.length>0&&<ul>{c.items.map(item=><li key={item}>{item}</li>)}</ul>}</section>)}</section>
 <section className="sources-section"><h2><img src={art('correct')} alt=""/>Confirmed vs. Estimated</h2><div className="source-certainty"><h3>Confirmed</h3><p>Matched to an explicit allergen declaration or the allergen legend printed on the menu. AI reading can still make mistakes.</p></div><div className="source-certainty"><h3>Estimated</h3><p>Inferred by AI from the dish name or ingredient clues when no explicit declaration is available. A useful guide, not a guarantee.</p></div></section>
 <aside className="sources-notice"><img src={art('warning')} alt=""/><p>YOEO is a reference tool, not medical advice. Always confirm ingredients and preparation with restaurant staff before ordering, especially if your allergy is severe.</p></aside>
 </div><Navigation active="profile" onChange={navigate}/></div>;
}
