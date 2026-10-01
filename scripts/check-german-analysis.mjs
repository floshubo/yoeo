import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const profile=[{name:'Milk',severity:'Critical'},{name:'Eggs',severity:'Avoid'}];
for(const withLegend of [true,false]) {
 const text=withLegend?'Speisekarte: Käsespätzle (G, B). Grüner Salat. Allergenliste: G = Milch; B = Eier.':'Speisekarte: Käsespätzle. Grüner Salat. Keine Zutatenliste verfügbar.';
 const response=await fetch('http://127.0.0.1:5187/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images:[],text,profile})});
 const report=await response.json();if(!response.ok)throw Error(report.error);
 assert.ok(report.dishes.some(d=>d.name.includes('Käsespätzle')),'German umlauts must survive the provider round trip');
 const cheese=report.dishes.find(d=>d.name.includes('Käsespätzle'));
 if(withLegend){assert.ok(cheese.allergens.some(a=>a.name==='Milk'&&a.source==='legend'&&a.severity==='Critical'));assert.ok(cheese.allergens.some(a=>a.name==='Eggs'&&a.source==='legend'));await writeFile('test-results/german-legend-report.json',JSON.stringify(report,null,2));}
 else {assert.ok(cheese.allergens.some(a=>a.source==='ai'&&a.certainty==='possible'));}
 console.log(JSON.stringify({withLegend,dish:cheese.name,sources:cheese.allergens.map(a=>a.source),status:cheese.status}));
}
