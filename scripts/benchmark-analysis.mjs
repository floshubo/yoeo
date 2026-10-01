// Explicit opt-in live benchmark. Uses synthetic photos and the local server API key.
import 'dotenv/config';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyze, getConfig } from '../server/ai.mjs';

if (!process.argv.includes('--live')) throw Error('Pass --live to make paid provider requests with synthetic fixtures.');
const config = getConfig();
if (!config.key) throw Error('Configure the server AI key locally before benchmarking.');
const require = createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'));
const sharp = require('sharp');
const baselineRef = process.env.YOEO_BASELINE_REF || 'ac53e2b';
const baselineSource = execFileSync('git', ['show', `${baselineRef}:server/ai.mjs`], {encoding:'utf8'})
  .replaceAll('"./schema.mjs"', JSON.stringify(pathToFileURL(path.resolve('server/schema.mjs')).href))
  .replaceAll('"./windows-fetch.mjs"', JSON.stringify(pathToFileURL(path.resolve('server/windows-fetch.mjs')).href));
const baseline = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
async function photo(lines, kind = 'menu') {
  const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="2000"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="Arial" font-size="31">${lines.map((line,i)=>`<text x="60" y="${80+i*85}">${escape(line)}</text>`).join('')}</g></svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({quality:88}).toBuffer();
  return {kind, data:`data:image/jpeg;base64,${jpeg.toString('base64')}`};
}
const entries = [
  ['Tomato soup','tomato, water, olive oil',[]], ['Mushroom soup','mushrooms, cream, stock',['Milk']],
  ['Grilled cheese','wheat bread, butter, cheddar',['Wheat','Milk']], ['Garden salad','lettuce, tomato, cucumber',[]],
  ['Caesar salad','lettuce, egg dressing, parmesan, wheat croutons',['Eggs','Milk','Wheat']],
  ['Pesto pasta','wheat pasta, basil, parmesan, pine nuts',['Wheat','Milk']],
  ['Margherita pizza','wheat dough, tomato, mozzarella',['Wheat','Milk']], ['Vegetable curry','coconut milk, chickpeas, carrots',[]],
  ['Salmon plate','salmon, potatoes, butter',['Fish','Milk']], ['Garlic shrimp','shrimp, garlic, olive oil',['Crustaceans']],
  ['Beef burger','beef, wheat bun, cheddar',['Wheat','Milk']], ['Chicken rice','chicken, rice, soy sauce',['Soybeans']],
  ['Peanut noodles','wheat noodles, peanuts, soy sauce',['Wheat','Peanuts','Soybeans']], ['Tofu stir fry','tofu, broccoli, soy sauce',['Soybeans']],
  ['Omelette','eggs, milk, cheese',['Eggs','Milk']], ['Hummus plate','chickpeas, sesame tahini, lemon',['Sesame']],
  ['Lentil stew','lentils, celery, tomato',['Celery']], ['Chocolate cake','wheat flour, eggs, milk, cocoa',['Wheat','Eggs','Milk']],
  ['Apple crumble','apples, wheat flour, butter',['Wheat','Milk']], ['Vanilla ice cream','milk, cream, eggs',['Milk','Eggs']],
];
const fixtures = [
  {name:'20 dishes', images:[await photo(entries.map(([name,ingredients])=>`${name}: ${ingredients}`))], expected:entries.map(([name,,allergens])=>({name,allergens}))},
  {name:'separate German legend', images:[await photo(['Käsespätzle — X7','Tofu mit Gemüse — Q2','Fischsuppe — M9','Grüner Salat — Z0']), await photo(['Restaurant allergen key','X7: Milch, Weizen, Eier','Q2: Sojabohnen','M9: Fisch, Sellerie','Z0: keine deklarierten Allergene'],'legend')], expected:[
    {name:'Käsespätzle',allergens:['Milk','Wheat','Eggs'],codes:['X7']}, {name:'Tofu mit Gemüse',allergens:['Soybeans'],codes:['Q2']},
    {name:'Fischsuppe',allergens:['Fish','Celery'],codes:['M9']}, {name:'Grüner Salat',allergens:[],codes:['Z0']},
  ]},
];
const variants = [
  {name:'baseline-mini', fn:baseline.analyze, model:'gpt-4.1-mini'},
  {name:'concise-mini', fn:analyze, model:'gpt-4.1-mini'},
  {name:'concise-nano', fn:analyze, model:'gpt-4.1-nano'},
];
const results = [];
for (let repeat=0; repeat<Number(process.env.YOEO_BENCH_REPEATS || 2); repeat++) {
  for (const fixture of fixtures) for (const variant of (repeat % 2 ? [...variants].reverse() : variants)) {
    const start = performance.now();
    let tokens;
    try {
      const report = await variant.fn({images:fixture.images,text:'',profile:[{name:'Milk',severity:'Critical'}]}, {
        config:{...config,model:variant.model},
        fetchImpl:async (...args) => {
          const response = await fetch(...args);
          if (response.ok) {const data=await response.clone().json(); tokens=data.usage?.completion_tokens;}
          return response;
        },
      });
      const failures = [];
      if (report.dishes.length !== fixture.expected.length) failures.push('dish count');
      for (const expected of fixture.expected) {
        const dish = report.dishes.find(d=>d.name===expected.name);
        if (!dish) {failures.push(`missing/original name: ${expected.name}`);continue;}
        for (const allergen of expected.allergens) if (!dish.allergens.some(a=>a.name===allergen)) failures.push(`${expected.name}: missing ${allergen}`);
        if (expected.allergens.includes('Milk') && dish.status !== 'Critical') failures.push(`${expected.name}: severity`);
        if (expected.codes && JSON.stringify([...dish.allergenCodes].sort()) !== JSON.stringify([...expected.codes].sort())) failures.push(`${expected.name}: codes`);
        if (dish.status === 'Safe') failures.push(`${expected.name}: unsupported safe claim`);
      }
      results.push({repeat,fixture:fixture.name,variant:variant.name,ms:Math.round(performance.now()-start),outputTokens:tokens,dishes:report.dishes.length,failures});
    } catch (error) { results.push({repeat,fixture:fixture.name,variant:variant.name,ms:Math.round(performance.now()-start),error:error.status ? error.message : 'Provider connection failed'}); }
    console.log(JSON.stringify(results.at(-1)));
    writeFileSync('docs/analysis-benchmark.json', JSON.stringify({date:new Date().toISOString(),baselineRef,results},null,2)+'\n');
  }
}
