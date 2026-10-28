// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const {chromium}=require(process.argv[2]||"playwright");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
 try{
 const page=await browser.newPage();
 await page.setContent('<!doctype html><div id="fixture"></div>');
 for(const file of ["core.js","rich.js","snippet-blocks.js"])await page.addScriptTag({path:runtimeFile(file)});
 const cases=[
 ...require(runtimeFile("examples.js")).map(({replacement,format})=>({source:replacement,format:format||"text"})),
 {source:"First line\n\nSecond line\n{date}\nLast line\n",format:"text"},
 {source:"Keep <literal> & quotes \" and ' · 👩‍💻 é",format:"text"},
 {source:'{if: day == "Monday"}A {form: first name}{if: time < 12}morning{else}later{endif}{else}Other{endif}',format:"text"},
 {source:"Incomplete {form: draft",format:"text"},
 {source:'<p><b>Hello {form: name}</b></p><ul><li>{date}</li><li>{cursor}Text</li></ul>',format:"html"}
 ];
 for(const c of cases){
 const result=await page.evaluate(({source,format})=>{
 const el=document.getElementById("fixture");SnippetBlocks.renderEditor(el,source,{format});
 return {actual:SnippetBlocks.serialize(el,{format}),expected:format==="html"?RichSnippet.sanitize(source):source,raw:el.textContent,blocks:el.querySelectorAll(".snippet-block").length};
 },c);
 assert.equal(result.actual,result.expected,"render/save must preserve "+JSON.stringify(c.source));
 }
 await page.evaluate(()=>SnippetBlocks.renderPreview(document.getElementById("fixture"),"<b>{date}</b><script>window.bad=true</script>",{format:"html"}));
 assert.equal(await page.locator("#fixture script,#fixture [onclick],#fixture button").count(),0);
 assert.equal(await page.locator('#fixture .snippet-block[data-type="date"] svg').count(),1);
 assert.equal(await page.evaluate(()=>window.bad),undefined);
 console.log("PASS visual blocks: focused demos, nested condition/template roundtrips, multiline/unicode/literal text, formatted serialization, and safe read-only previews.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
