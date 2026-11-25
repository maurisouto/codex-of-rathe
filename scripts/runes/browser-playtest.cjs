const fs = require("node:fs");
const assert = require("node:assert/strict");

const endpoint = process.env.RUNES_CDP_URL || "http://127.0.0.1:9222";
const appUrl = process.env.RUNES_APP_URL || "http://127.0.0.1:3000";

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async ready() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async evaluate(expression, sessionId, awaitPromise = false) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise, timeout: 15_000 }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(cdp, session, expression, message, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await cdp.evaluate(expression, session)) return;
    await sleep(150);
  }
  const currentText = await cdp.evaluate("document.body.innerText.slice(0,1200)", session).catch(() => "<unavailable>");
  throw new Error(`Timed out: ${message}. Page text: ${currentText}`);
}

async function clickButton(cdp, session, label) {
  await waitFor(cdp, session, `(()=>{const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim()==${JSON.stringify(label)});return Boolean(button&&!button.disabled)})()`, `enabled button ${label}`);
  const clicked = await cdp.evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim()==${JSON.stringify(label)}); if(!button) return false; button.click(); return true; })()`, session);
  assert.equal(clicked, true, `button ${label} exists`);
}

async function inspect(cdp, session) {
  return cdp.evaluate(`(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    radios: [...document.querySelectorAll('input[name="runes-artwork"]')].map((radio)=>({checked:radio.checked,label:radio.labels?.[0]?.innerText.trim()})),
    images: [...document.querySelectorAll('fieldset img')].map((img)=>({complete:img.complete,width:img.naturalWidth,height:img.naturalHeight,src:img.currentSrc.slice(0,30)})),
    activeText: document.querySelector('main')?.innerText ?? '',
    timer: [...document.querySelectorAll('p')].find((p)=>p.innerText.startsWith('Time '))?.innerText ?? ''
  }))()`, session);
}

async function verifyNoAnswerLeak(cdp, session) {
  return cdp.evaluate(`(async()=>{const token=localStorage.getItem('gac-guest-token');const response=await fetch('/api/runes/runs',{headers:{'x-guest-id':token}});return {status:response.status,payload:await response.json()}})()`, session, true);
}

async function main() {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  const browser = new CDP(version.webSocketDebuggerUrl);
  const { browserContextId } = await browser.send("Target.createBrowserContext");
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = browser;
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("DOM.enable", {}, sessionId);
  await cdp.send("CSS.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  const results = [];

  const setViewport = async (width, height = 850, scale = 1) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
  const saveScreenshot = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    fs.writeFileSync(`/tmp/read-the-runes-${name}.png`, Buffer.from(data, "base64"));
  };
  const goto = async (path) => {
    await cdp.send("Page.navigate", { url: `${appUrl}${path}` }, sessionId);
    await waitFor(cdp, sessionId, "Boolean(document.querySelector('main'))", `route ${path}`);
  };

  // Hold the guest handshake before the first round lookup, then allow a real retry.
  const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `const originalFetch = window.fetch;
      window.fetch = function(input, options) {
        if (input === "/api/guest/session" && !window.failFirstGuestCheck) {
          return new Promise(resolve => {
            window.failFirstGuestCheck = () => resolve(new Response("{}", {status: 503}));
          });
        }
        return originalFetch.call(this, input, options);
      };`,
  }, sessionId);
  await goto("/runes");
  await waitFor(cdp, sessionId, "typeof window.failFirstGuestCheck === 'function'", "pending guest session");
  const hero = "document.querySelector('main h1').closest('section')";
  const waiting = await cdp.evaluate(`({
    status: ${hero}.querySelector('[role=status]')?.textContent,
    disabled: [...${hero}.querySelectorAll('button')].map(button => button.disabled),
    tutorial: ${hero}.querySelector('button[aria-describedby], #tutorial-description')?.textContent
  })`, sessionId);
  assert.match(waiting.status, /Checking for an active round/);
  assert.deepEqual(waiting.disabled, [true]);
  assert.equal(waiting.tutorial, undefined);
  await cdp.evaluate("window.failFirstGuestCheck()", sessionId);
  await waitFor(cdp, sessionId, `Boolean(${hero}.querySelector('[role=alert]')) && !${hero}.querySelector('[role=status]')`, "recoverable guest session error in the hero");
  await clickButton(cdp, sessionId, "Retry round check");
  await waitFor(cdp, sessionId, `!${hero}.querySelector('[role=alert], [role=status], button:disabled')`, "successful retry enables Start round");
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }, sessionId);
  results.push("guest handshake, hero status, single start CTA, session failure and retry");

  await setViewport(1280);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "hover" }, { name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await goto("/");
  await waitFor(cdp, sessionId, "Boolean(document.querySelector('[data-runes-hub-brand]'))", "Read the Runes hub logo");
  await waitFor(cdp, sessionId, "(()=>{const image=document.querySelector('[data-runes-hub-seal]');return Boolean(image?.complete&&image.naturalWidth>0)})()", "loaded Read the Runes hub seal");
  await cdp.evaluate("(()=>{const element=document.querySelector('[data-runes-hub-brand]')?.parentElement;const rect=element.getBoundingClientRect();scrollTo({top:rect.top+scrollY-300,behavior:'instant'})})()", sessionId);
  await sleep(250);
  const hubBase = await cdp.evaluate("(()=>{const element=document.querySelector('[data-runes-hub-brand]')?.parentElement;const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return {x:rect.left,width:rect.width,top:rect.top,translate:style.translate,transition:style.transitionProperty}})()", sessionId);
  assert.ok(hubBase.width > 0 && hubBase.width < 700, "the hub tile is visible at desktop width");
  await saveScreenshot("hub-desktop");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hubBase.x + hubBase.width / 2, y: hubBase.top + 80 }, sessionId);
  await sleep(350);
  const hubHover = await cdp.evaluate("(()=>{const element=document.querySelector('[data-runes-hub-brand]')?.parentElement;const logo=element.querySelector('[data-runes-hub-seal]');const cta=element.querySelector('a');return {translate:getComputedStyle(element).translate,transition:getComputedStyle(element).transitionProperty,hover:element.matches(':hover'),logoTransform:getComputedStyle(logo).transform,logoFilter:getComputedStyle(logo).filter,ctaBackground:getComputedStyle(cta).backgroundImage}})()", sessionId);
  assert.equal(hubHover.hover, true, "the tile receives the desktop hover state");
  assert.match(hubHover.transition, /translate/, "the tile animates its lift");
  assert.match(hubHover.logoFilter, /drop-shadow/, "hover adds a visible glow to the Codex logo");
  assert.match(hubHover.ctaBackground, /gradient/, "the Codex CTA has its layered violet background");
  await saveScreenshot("hub-desktop-hover");
  const ctaPosition = await cdp.evaluate("(()=>{const r=document.querySelector('[data-runes-hub-brand]')?.parentElement.querySelector('a').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()", sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ctaPosition.x, y: ctaPosition.y }, sessionId);
  await sleep(250);
  const ctaHover = await cdp.evaluate("(()=>{const cta=document.querySelector('[data-runes-hub-brand]')?.parentElement.querySelector('a'),style=getComputedStyle(cta);return {hover:cta.matches(':hover'),background:style.backgroundImage,color:style.color}})()", sessionId);
  assert.equal(ctaHover.hover, true, "the Codex CTA enters hover state");
  assert.match(ctaHover.background, /gradient/, "hover retains the violet CTA texture");
  await saveScreenshot("hub-desktop-cta-hover");
  await cdp.evaluate("document.querySelector('[data-runes-hub-brand]')?.parentElement.querySelector('a').focus()", sessionId);
  const ctaFocus = await cdp.evaluate("(()=>{const cta=document.querySelector('[data-runes-hub-brand]')?.parentElement.querySelector('a'),style=getComputedStyle(cta);return {focused:document.activeElement===cta,outline:style.outlineWidth,outlineColor:style.outlineColor,color:style.color}})()", sessionId);
  assert.equal(ctaFocus.focused, true, "the Codex CTA receives keyboard focus");
  assert.equal(ctaFocus.outline, "2px", "the Codex CTA has a visible focus outline");
  await saveScreenshot("hub-desktop-cta-focus");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "hover" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hubBase.x + hubBase.width / 2, y: hubBase.top + 80 }, sessionId);
  const reducedHover = await cdp.evaluate("(()=>{const element=document.querySelector('[data-runes-hub-brand]')?.parentElement;const style=getComputedStyle(element),logo=getComputedStyle(element.querySelector('[data-runes-hub-seal]'));return {translate:style.translate,transition:style.transitionProperty,logoTransform:logo.transform,logoTransition:logo.transitionProperty}})()", sessionId);
  assert.equal(reducedHover.translate, "none", "reduced motion removes the tile lift");
  assert.equal(reducedHover.transition, "none", "reduced motion removes the transition override");
  assert.equal(reducedHover.logoTransform, "none", "reduced motion removes logo scaling");
  assert.equal(reducedHover.logoTransition, "none", "reduced motion removes logo animation");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] }, sessionId);
  await cdp.evaluate("document.activeElement.blur()", sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 }, sessionId);
  for (const width of [320, 390]) {
    await setViewport(width, 844);
    await cdp.evaluate("(()=>{const element=document.querySelector('[data-runes-hub-brand]')?.parentElement;const rect=element.getBoundingClientRect();scrollTo({top:rect.top+scrollY-180,behavior:'instant'})})()", sessionId);
    await sleep(150);
    const hubMobile = await cdp.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})", sessionId);
    assert.ok(hubMobile.scroll <= hubMobile.width, `mobile hub has no horizontal overflow at ${width}px`);
    await saveScreenshot(width === 390 ? "hub-mobile" : "hub-mobile-320");
  }
  results.push("hub logo hover glow/scale, violet CTA hover/focus, reduced-motion behavior, and 1280/390/320px screenshots");

  await setViewport(1280);
  await goto("/runes");
  await waitFor(cdp, sessionId, "Boolean(document.querySelector('h1 img[alt=\"Read the Runes\"]'))", "setup header logo");
  await cdp.evaluate("(()=>{const example=document.querySelector('[data-runes-example]');const rect=example.getBoundingClientRect();scrollTo({top:rect.top+scrollY-40,behavior:'instant'})})()", sessionId);
  await waitFor(cdp, sessionId, "(()=>{const example=document.querySelector('[data-runes-example]');return example?.querySelectorAll('figure img').length===4 && [...example.querySelectorAll('img')].every((image)=>image.complete&&image.naturalWidth>0)})()", "four loaded example artwork crops");
  const exampleContent = await cdp.evaluate(`(()=>{const example=document.querySelector('[data-runes-example]');const text=example.innerText;const gallery=example.querySelector('ol[aria-label="Four artwork options"]').getBoundingClientRect();const clue=example.querySelector('aside[data-example-current-clue]').getBoundingClientRect();const cluePanels=[...document.querySelectorAll('[data-example-current-clue]')];const labelsResolveUniquely=cluePanels.every((panel)=>{const id=panel.getAttribute('aria-labelledby');return id&&document.getElementById(id)?.parentElement===panel&&[...document.querySelectorAll('[id]')].filter((element)=>element.id===id).length===1});return {artworks:example.querySelectorAll('figure img').length,labels:[...example.querySelectorAll('figure figcaption')].map((item)=>item.innerText.trim()),text,desktopClueBesideGallery:clue.left>=gallery.right-1,labelsResolveUniquely}})()` , sessionId);
  assert.equal(exampleContent.artworks, 4, "the example presents four artwork choices");
  assert.deepEqual(exampleContent.labels, ["A\nArtwork A", "B\nArtwork B", "C\nArtwork C", "D\nArtwork D"]);
  assert.match(exampleContent.text, /Clues used: 1/);
  assert.match(exampleContent.text, /Remaining: 1/);
  assert.match(exampleContent.text, /CURRENT CLUE[\s\S]*Class[\s\S]*Runeblade/);
  assert.equal(exampleContent.desktopClueBesideGallery, true, "desktop example places its current clue beside the artwork choices");
  assert.equal(exampleContent.labelsResolveUniquely, true, "each setup and dialog clue panel has a unique aria-labelledby target");
  await cdp.evaluate("(()=>{const example=document.querySelector('[data-runes-example]');const rect=example.getBoundingClientRect();scrollTo({top:rect.top+scrollY-40,behavior:'instant'})})()", sessionId);
  await sleep(150);
  await saveScreenshot("how-to-example-desktop");
  for (const width of [390, 320]) {
    await setViewport(width, 844);
    const mobileExample = await cdp.evaluate(`(()=>{const example=document.querySelector('[data-runes-example]');const rect=example.getBoundingClientRect();const gallery=example.querySelector('ol[aria-label="Four artwork options"]').getBoundingClientRect();const clue=example.querySelector('aside[data-example-current-clue]').getBoundingClientRect();return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,exampleWidth:rect.width,galleryWidth:gallery.width,clueTop:clue.top,galleryBottom:gallery.bottom}})()`, sessionId);
    assert.ok(mobileExample.scroll <= mobileExample.viewport, `example has no horizontal overflow at ${width}px`);
    assert.ok(mobileExample.exampleWidth <= width, `example fits the ${width}px viewport`);
    assert.ok(mobileExample.clueTop >= mobileExample.galleryBottom, `current clue follows the artwork gallery at ${width}px`);
    await cdp.evaluate("(()=>{const example=document.querySelector('[data-runes-example]');const rect=example.getBoundingClientRect();scrollTo({top:rect.top+scrollY-30,behavior:'instant'})})()", sessionId);
    await sleep(120);
    await saveScreenshot(width === 390 ? "how-to-example-mobile" : "how-to-example-mobile-320");
  }
  if (process.env.RUNES_EXAMPLE_ONLY === "1") {
    results.push("How to Play example shows four loaded artwork crops, clue count and current verified clue at 1280/390/320px with no horizontal overflow");
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
    browser.socket.close();
    return;
  }
  await saveScreenshot("game-desktop");
  for (const width of [320, 390]) {
    await setViewport(width, 844);
    const setupMobile = await cdp.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})", sessionId);
    assert.ok(setupMobile.scroll <= setupMobile.width, `mobile game setup has no horizontal overflow at ${width}px`);
    await saveScreenshot(width === 390 ? "game-mobile" : "game-mobile-320");
  }
  if (process.env.RUNES_VISUAL_ONLY === "1") {
    results.push("game setup captured at 1280/390/320px with no mobile horizontal overflow");
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
    browser.socket.close();
    return;
  }
  await setViewport(1280);
  for (const width of [320, 390, 768, 1280]) {
    await setViewport(width, width < 400 ? 780 : 850, width === 320 ? 2 : 1);
    const layout = await cdp.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})", sessionId);
    assert.ok(layout.scroll <= layout.width, `setup has no horizontal overflow at ${width}px: ${layout.scroll}`);
    results.push(`setup ${width}px no horizontal overflow`);
  }
  await setViewport(1280);
  for (const section of ["how", "faq"]) {
    await cdp.evaluate(`document.querySelector('header a[href="#${section}"]')?.click()`, sessionId);
    await waitFor(cdp, sessionId, `location.hash==='#${section}' && Boolean(document.getElementById('${section}'))`, `${section} anchor`);
  }
  results.push("setup How to play and FAQ header anchors");

  // Keep API tutorial coverage after removing its setup CTA.
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Start guided tutorial'))", sessionId), false);
  await cdp.evaluate(`(async()=>{const r=await fetch('/api/runes/runs',{method:'POST',headers:{'Content-Type':'application/json','x-guest-id':localStorage.getItem('gac-guest-token')},body:JSON.stringify({mode:'tutorial'})});if(r.status!==201)throw new Error(await r.text())})()`, sessionId, true);
  await goto("/runes");
  await waitFor(cdp, sessionId, "document.querySelectorAll('[data-runes-active] input:enabled').length===4", "tutorial ready");
  const assertClueCount = async (expected, previousRunId) => {
    const { status, payload } = await verifyNoAnswerLeak(cdp, sessionId);
    assert.equal(status, 200);
    assert.equal(payload.cluesUsed, expected);
    assert.equal(payload.clues.length, expected);
    if (previousRunId) assert.notEqual(payload.runId, previousRunId);
    const displayedClues = await cdp.evaluate("[...document.querySelectorAll('[data-runes-active] aside ol li')].map(li=>li.textContent)", sessionId);
    assert.equal(displayedClues.length, expected);
    payload.clues.forEach(clue => assert.ok(displayedClues[clue.number - 1].includes(clue.value)));
    const text = await cdp.evaluate("document.querySelector('[data-runes-clue-count]')?.textContent", sessionId);
    assert.match(text, new RegExp(`^Clues used: ${expected} ·`));
    return payload.runId;
  };
  const firstRunId = await assertClueCount(1);
  let info = await inspect(cdp, sessionId);
  assert.deepEqual(info.images.map(({ width, height, complete }) => [width, height, complete]), Array.from({ length: 4 }, () => [330, 276, true]));
  const activePayload = await verifyNoAnswerLeak(cdp, sessionId);
  assert.equal(activePayload.status, 200);
  assert.equal(activePayload.payload.status, "active");
  assert.equal(JSON.stringify(activePayload.payload).includes("Read the Runes"), false);
  assert.equal(JSON.stringify(activePayload.payload).includes("Max Kostin"), false);
  assert.equal(JSON.stringify(activePayload.payload).includes("ARC109"), false);
  assert.equal(activePayload.payload.artworks.length, 4);
  results.push("tutorial loads four 330×276 crop-only options; active API has no card name, clue 2, or image code");

  await cdp.evaluate("document.querySelectorAll('input[name=\"runes-artwork\"]')[1].click()", sessionId);
  await waitFor(cdp, sessionId, "document.querySelectorAll('input[name=\"runes-artwork\"]')[1].checked", "select tutorial target");
  await clickButton(cdp, sessionId, "Read the Runes");
  await waitFor(cdp, sessionId, "document.body.innerText.includes('Max Kostin')", "second tutorial clue");
  assert.equal((await inspect(cdp, sessionId)).radios[1].checked, true, "reveal retains selected artwork");
  await assertClueCount(2);

  await clickButton(cdp, sessionId, "How to play & FAQ");
  await waitFor(cdp, sessionId, "document.querySelector('dialog[aria-labelledby=active-help-title]')?.open===true", "in-game help dialog");
  const timerBeforeHelp = (await inspect(cdp, sessionId)).timer;
  await sleep(1100);
  const timerAfterHelp = (await inspect(cdp, sessionId)).timer;
  assert.notEqual(timerAfterHelp, timerBeforeHelp, "timer continues while the modal help is open");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(cdp, sessionId, "document.querySelector('dialog[aria-labelledby=active-help-title]')?.open===false", "close in-game help");
  await waitFor(cdp, sessionId, "document.activeElement.textContent.trim()==='How to play & FAQ'", "restore focus after in-game help closes");
  assert.equal(await cdp.evaluate("document.activeElement.textContent.trim()", sessionId), "How to play & FAQ", "Escape restores focus to help trigger");

  await cdp.evaluate("document.querySelector('header a[href=\"#how\"]')?.click()", sessionId);
  await waitFor(cdp, sessionId, "location.hash==='#how' && Boolean(document.getElementById('how'))", "active how anchor");
  await sleep(1100);
  const timerAfterHow = (await inspect(cdp, sessionId)).timer;
  assert.notEqual(timerAfterHow, timerAfterHelp, "timer continues while reading the anchored help section");
  await cdp.evaluate("document.querySelector('header a[href=\"#faq\"]')?.click()", sessionId);
  await waitFor(cdp, sessionId, "location.hash==='#faq' && Boolean(document.getElementById('faq'))", "active FAQ anchor");
  assert.equal((await inspect(cdp, sessionId)).radios[1].checked, true, "anchor navigation keeps selected artwork and run");
  await assertClueCount(2);
  results.push("active help and clue review do not increment server or UI count; timer continues");

  assert.equal(await cdp.evaluate("Boolean(document.querySelector('button[aria-label^=Enlarge], dialog[aria-label=\"Enlarged artwork\"]'))", sessionId), false);
  results.push("fixed artwork crops without enlargement control or modal");

  const radios = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
  const radioNodes = radios.nodes.filter((node) => node.role?.value === "radio");
  assert.equal(radioNodes.length, 4, "native radio group is exposed once in the accessibility tree");
  await cdp.evaluate("document.querySelector('input[name=\"runes-artwork\"]').focus()", sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }, sessionId);
  const box = await cdp.evaluate("(()=>{const r=document.activeElement;return {id:r.id,outline:getComputedStyle(r.nextElementSibling).outlineStyle,width:getComputedStyle(r.nextElementSibling).outlineWidth}})()", sessionId);
  assert.ok(box.width && box.width !== "0px", `radio focus indicator is visible (${JSON.stringify(box)})`);
  assert.equal((await inspect(cdp, sessionId)).radios[1].checked, true, "ArrowRight follows native radio order");
  results.push("native four-radio group and visible keyboard focus indicator");

  await clickButton(cdp, sessionId, "Confirm answer");
  await waitFor(cdp, sessionId, "document.getElementById('runes-result-title')?.innerText==='Correct'", "tutorial win");
  let resultText = await cdp.evaluate("document.querySelector('main')?.innerText ?? ''", sessionId);
  assert.match(resultText, /practice round leaves your records and statistics untouched/);
  assert.match(resultText, /Max Kostin/);
  assert.match(resultText, /Clues revealed/);
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('img[alt^=\"Full card:\"]'))", sessionId), true);
  results.push("tutorial correct answer reveals full card and terminal clue review");

  await clickButton(cdp, sessionId, "Play again");
  await waitFor(cdp, sessionId, "Boolean(document.querySelector('[data-runes-active] input:enabled'))", "tutorial replay ready");
  const secondRunId = await assertClueCount(1, firstRunId);
  await cdp.evaluate("document.querySelectorAll('input[name=\"runes-artwork\"]')[0].click()", sessionId);
  await clickButton(cdp, sessionId, "Confirm answer");
  await waitFor(cdp, sessionId, "document.getElementById('runes-result-title')?.innerText==='Incorrect'", "tutorial immediate loss");
  resultText = await cdp.evaluate("document.querySelector('main')?.innerText ?? ''", sessionId);
  assert.match(resultText, /You chose Artwork A; the hidden artwork was Artwork B/);
  assert.match(resultText, /Read the Runes/);
  assert.match(resultText, /1 clue/);
  assert.match(resultText, /Illustrated by[\s\S]*Max Kostin/);
  const terminal = (await verifyNoAnswerLeak(cdp, sessionId)).payload;
  assert.equal(terminal.runId, secondRunId);
  assert.equal(terminal.cluesUsed, 1);
  assert.equal(terminal.result.cluesUsed, 1);
  assert.equal(terminal.clues.length, 2, "review exposes unused clue without counting it");
  results.push("consecutive win/replay/loss resets count from 2 to 1; terminal review does not count unused clues");

  await clickButton(cdp, sessionId, "Back to setup");
  await waitFor(cdp, sessionId, "Boolean(document.querySelector('h1 img[alt=\"Read the Runes\"]'))", "back to setup after ack");
  await clickButton(cdp, sessionId, "Start round");
  await waitFor(cdp, sessionId, "Boolean(document.querySelector('[data-runes-active] input:enabled'))", "ranked guest round ready", 30_000);
  const rankedRunId = await assertClueCount(1, secondRunId);
  for (const width of [320, 390, 768, 1280]) {
    await setViewport(width, 780, width === 320 ? 2 : 1);
    const layout = await cdp.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',x:Math.round(e.getBoundingClientRect().x),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width),parent:e.parentElement?.tagName+'.'+(typeof e.parentElement?.className==='string'?e.parentElement.className:''),parentX:Math.round(e.parentElement?.getBoundingClientRect().x??0),parentWidth:Math.round(e.parentElement?.getBoundingClientRect().width??0),text:e.innerText?.slice(0,50)})).filter(e=>e.right>innerWidth+1).slice(0,8)})", sessionId);
    assert.ok(layout.scroll <= layout.width, `active game has no horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
    results.push(`active ${width}px no horizontal overflow`);
  }
  const storage = await cdp.evaluate("({token:localStorage.getItem('gac-guest-token')})", sessionId);
  const guestStats = await cdp.evaluate(`(async()=>{const r=await fetch('/api/runes/stats',{headers:{'x-guest-id':${JSON.stringify(storage.token)}}});return await r.json()})()`, sessionId, true);
  assert.equal(guestStats.games, 0, "guest rounds are excluded from recorded stats");
  await cdp.evaluate("document.querySelector('input[name=\"runes-artwork\"]')?.click()", sessionId);
  await clickButton(cdp, sessionId, "Confirm answer");
  await waitFor(cdp, sessionId, "['Correct','Incorrect'].includes(document.getElementById('runes-result-title')?.innerText)", "guest terminal result");
  resultText = await cdp.evaluate("document.querySelector('main')?.innerText ?? ''", sessionId);
  assert.match(resultText, /Guest rounds are not saved to records, statistics, or rankings/);
  const guestStatsAfterResult = await cdp.evaluate(`(async()=>{const r=await fetch('/api/runes/stats',{headers:{'x-guest-id':${JSON.stringify(storage.token)}}});return await r.json()})()`, sessionId, true);
  assert.equal(guestStatsAfterResult.games, 0, "completed guest rounds remain excluded from recorded stats");
  results.push("guest can finish a round; result copy disclaims records and guest stats remain empty");

  await clickButton(cdp, sessionId, "Play again");
  await waitFor(cdp, sessionId, "Boolean(document.querySelector('[data-runes-active] input:enabled'))", "ranked replay ready", 30_000);
  await assertClueCount(1, rankedRunId);
  const selected = await cdp.evaluate("[...document.querySelectorAll('input[name=runes-artwork]')].some(r => r.checked)", sessionId);
  assert.equal(selected, false, "new ranked round does not inherit the previous selection");
  results.push("new ranked game and ranked replay both start at one with distinct run IDs");

  await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId).then(({ data }) => fs.writeFileSync("/tmp/read-the-runes-active.png", Buffer.from(data, "base64")));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  browser.socket.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
