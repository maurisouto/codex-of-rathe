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
  await cdp.send("Network.enable", {}, sessionId);
  const results = [];

  const setViewport = async (width, height = 850, scale = 1) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
  const goto = async (path) => {
    await cdp.send("Page.navigate", { url: `${appUrl}${path}` }, sessionId);
    await waitFor(cdp, sessionId, "Boolean(document.querySelector('main'))", `route ${path}`);
  };

  await setViewport(1280);
  await goto("/runes");
  await waitFor(cdp, sessionId, "document.querySelector('h1')?.innerText==='Read the Runes'", "setup header");
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

  await clickButton(cdp, sessionId, "Try the tutorial");
  await waitFor(cdp, sessionId, "document.querySelectorAll('input[name=\"runes-artwork\"]').length===4 && document.body.innerText.includes('Clues used: 1')", "tutorial ready");
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
  results.push("active help dialog and How/FAQ anchors work without losing selection; timer continues");

  await cdp.evaluate("document.querySelector('button[aria-label=\"Enlarge Artwork A\"]')?.click()", sessionId);
  await waitFor(cdp, sessionId, "document.querySelector('dialog[aria-label=\"Enlarged artwork\"]')?.open===true", "artwork enlargement dialog");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(cdp, sessionId, "document.querySelector('dialog[aria-label=\"Enlarged artwork\"]')?.open===false", "close enlarged artwork");
  await waitFor(cdp, sessionId, "document.activeElement.getAttribute('aria-label')==='Enlarge Artwork A'", "restore focus after enlarged artwork closes");
  assert.equal(await cdp.evaluate("document.activeElement.getAttribute('aria-label')", sessionId), "Enlarge Artwork A", "Escape returns focus to the enlargement trigger");
  assert.equal((await inspect(cdp, sessionId)).radios[1].checked, true, "enlargement does not change selection");
  results.push("crop enlargement is a native modal; Escape restores trigger focus and keeps selection");

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
  assert.match(resultText, /Practice rounds do not count/);
  assert.match(resultText, /Max Kostin/);
  assert.match(resultText, /Clues revealed/);
  results.push("tutorial correct answer reveals full card and terminal clue review");

  await clickButton(cdp, sessionId, "Play again");
  await waitFor(cdp, sessionId, "document.body.innerText.includes('Clues used: 1')", "tutorial replay ready");
  await cdp.evaluate("document.querySelectorAll('input[name=\"runes-artwork\"]')[0].click()", sessionId);
  await clickButton(cdp, sessionId, "Confirm answer");
  await waitFor(cdp, sessionId, "document.getElementById('runes-result-title')?.innerText==='Incorrect'", "tutorial immediate loss");
  resultText = await cdp.evaluate("document.querySelector('main')?.innerText ?? ''", sessionId);
  assert.match(resultText, /Your answer was Artwork A/);
  assert.match(resultText, /The target was Artwork B/);
  assert.match(resultText, /Read the Runes/);
  assert.match(resultText, /1 clue/);
  assert.match(resultText, /Illustrated by[\s\S]*Max Kostin/);
  results.push("early wrong tutorial answer loses immediately; terminal review shows unused clue and target");

  await clickButton(cdp, sessionId, "Back to setup");
  await waitFor(cdp, sessionId, "document.querySelector('h1')?.innerText==='Read the Runes'", "back to setup after ack");
  await clickButton(cdp, sessionId, "Start round");
  await waitFor(cdp, sessionId, "document.body.innerText.includes('Clues used: 1')", "ranked guest round ready", 30_000);
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

  await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId).then(({ data }) => fs.writeFileSync("/tmp/read-the-runes-active.png", Buffer.from(data, "base64")));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  browser.socket.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
