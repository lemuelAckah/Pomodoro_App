/* books-companion.js — on-device reading companion: extractive summaries,
   key terms, study questions, flashcards. No network, fully private. */
import { state, $, $$, esc, sicon, notify } from "./core.js";

const STOP = new Set(("the,a,an,and,or,but,if,then,else,when,what,which,that,this,these,those,with,from,into,over,after,before,between,through,under,while,where,how,why,not,no,yes,are,is,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,must,shall,its,it,you,your,we,our,they,their,he,she,his,her,him,them,for,of,on,in,to,at,by,as,so,such,than,too,very,just,only,also,more,most,other,some,any,each,every,all,both,few,many,much,own,same,here,there,now,today,one,two,first,second,new,own,like,get,got,make,made,take,use,used,using,often,never,always,everything,something,anything,nothing,because,until,though,although,since,despite,toward,towards,among,within,without,about,into,onto,upon,across,along,amongst,per,via,etc,eg,ie,us,let,say,said,says,like,well,however,therefore,hence,thus,henceforth,meanwhile,otherwise,instead,elsewhere,anyway,anyhow,besides,moreover,furthermore,nevertheless,nonetheless,accordingly,consequently,meanwhile,qwerty").split(","));

function sentencesOf(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 600);
}
function wordFreq(text) {
  const freq = new Map();
  for (const w of String(text || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
    const clean = w.replace(/['-]$/g, "");
    if (clean.length < 5 || STOP.has(clean)) continue;
    freq.set(clean, (freq.get(clean) || 0) + 1);
  }
  return freq;
}
export function companionSummary(text, max = 3) {
  const sentences = sentencesOf(text);
  if (!sentences.length) return [];
  const freq = wordFreq(text);
  const scored = sentences.map((s, i) => {
    let score = 0;
    for (const w of s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
      const clean = w.replace(/['-]$/g, "");
      if (!STOP.has(clean)) score += freq.get(clean) || 0;
    }
    return { s, score: score / Math.sqrt(s.split(/\s+/).length), i };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(max, scored.length)).sort((a, b) => a.i - b.i).map((x) => x.s);
}
export function companionTerms(text, max = 12) {
  const freq = wordFreq(text);
  return [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term, count]) => ({ term, count }));
}
export function companionQuestions(text, title, max = 5) {
  const out = [];
  const sentences = sentencesOf(text);
  if (title) out.push(`What is the main idea of “${title}”?`);
  for (const s of sentences.slice(0, 12)) {
    const short = s.length > 110 ? s.slice(0, 110).replace(/\s+\S*$/, "") + "…" : s;
    if (/^[A-Z][^.!?]{10,80}[.!?]$/.test(s) && !/^(for example|for instance|in other words)/i.test(s)) {
      out.push(`Explain in your own words: “${short}”`);
      if (out.length >= max) break;
    }
  }
  const freq = wordFreq(text);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && out.length < max + 1) out.push(`How would you define “${top[0]}” to a beginner?`);
  return out.slice(0, max);
}
export function companionDefine(text, phrase) {
  const p = String(phrase || "").trim().toLowerCase();
  if (!p) return [];
  const hits = sentencesOf(text).filter((s) => s.toLowerCase().includes(p)).slice(0, 3);
  return hits;
}
export function companionContextLabel(ctx) {
  const t = String(ctx || "").trim().replace(/\s+/g, " ");
  if (!t) return "this section";
  return t.length > 90 ? `“${t.slice(0, 90)}…”` : `“${t}”`;
}

let compHistory = [];
let compBookId = null;
export function renderCompanionPanel(side) {
  const mod = side.__compMod || {};
  side.__compMod = mod;
  const render = () => {
    const hist = compHistory.filter((h) => h.book === mod.bookId);
    side.innerHTML = `<div class="section-row"><h3>Study companion</h3><button class="ghost" data-r-closepanel>Close</button></div>
    <p class="muted">On-device study tools — your book never leaves this browser. Context: ${esc(companionContextLabel(mod.ctx))}</p>
    <div class="companion-actions">
      <button class="ghost" data-comp-act="explain">Explain</button>
      <button class="ghost" data-comp-act="define">Define</button>
      <button class="ghost" data-comp-act="summarize">Summarize</button>
      <button class="ghost" data-comp-act="terms">Key terms</button>
      <button class="ghost" data-comp-act="questions">Quiz me</button>
      <button class="ghost" data-comp-act="cards">Flashcards</button>
    </div>
    <div class="input-row" style="margin-top:10px"><input class="input" data-comp-q placeholder="Ask about this passage…" aria-label="Ask about this passage"><button class="primary" data-comp-ask>Ask</button></div>
    <div data-comp-out>${hist.length ? hist.map(answerCard).join("") : '<p class="muted">Try “Explain”, pick a term, or ask in your own words.</p>'}</div>`;
    const c = side.querySelector("[data-r-closepanel]");
    if (c) c.onclick = mod.onClose;
    side.querySelectorAll("[data-comp-act]").forEach((b) => (b.onclick = () => runCompanion(mod, b.dataset.compAct, "")));
    const ask = () => {
      const q = side.querySelector("[data-comp-q]").value.trim().slice(0, 300);
      if (q) runCompanion(mod, "ask", q);
    };
    side.querySelector("[data-comp-ask]").onclick = ask;
    side.querySelector("[data-comp-q]").onkeydown = (e) => {
      if (e.key === "Enter") ask();
    };
    side.querySelectorAll("[data-comp-copy]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.compCopy;
      const h = compHistory.find((x) => x.key === id);
      if (!h) return;
      try {
        await navigator.clipboard.writeText(h.plain);
        notify("Copied");
      } catch {
        notify("Copy unavailable here");
      }
    }));
  };
  mod.rerender = render;
  render();
}
function answerCard(h) {
  return `<div class="companion-answer"><div class="section-row"><strong>${esc(h.title)}</strong><button class="ghost" data-comp-copy="${h.key}">Copy</button></div><div>${h.html}</div></div>`;
}
function pushAnswer(mod, title, html, plain) {
  if (mod.bookId !== compBookId) {
    compBookId = mod.bookId;
    compHistory = compHistory.filter((h) => h.book === mod.bookId);
  }
  compHistory = [...compHistory.filter((h) => h.book === mod.bookId), {
    key: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    book: mod.bookId, title, html, plain: plain || title,
  }].slice(-20);
  mod.rerender();
}
function runCompanion(mod, act, query) {
  const text = mod.contextText || "";
  if (!text.trim() && act !== "cards") {
    pushAnswer(mod, "No text to work with", "<p class=\"muted\">Open a text book section first.</p>", "No text");
    return;
  }
  if (act === "explain" || act === "summarize") {
    const top = companionSummary(text, 3);
    if (!top.length) return pushAnswer(mod, "Summary", "<p class=\"muted\">Not enough text here to summarize.</p>", "none");
    pushAnswer(mod, act === "explain" ? "In simpler terms" : "Summary",
      `<ul class="detail-steps">${top.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`,
      top.join("\n"));
  } else if (act === "define") {
    const terms = companionTerms(text, 8);
    if (!terms.length) return pushAnswer(mod, "Key terms", "<p class=\"muted\">No standout terms in this passage.</p>", "none");
    pushAnswer(mod, "Key terms here",
      `<ul class="detail-steps">${terms.map((t) => `<li><strong>${esc(t.term)}</strong> — appears ${t.count}× in this book</li>`).join("")}</ul>`,
      terms.map((t) => `${t.term} (${t.count}×)`).join(", "));
  } else if (act === "terms") {
    const terms = companionTerms(text, 14);
    if (!terms.length) return pushAnswer(mod, "Key terms", "<p class=\"muted\">No standout terms found.</p>", "none");
    pushAnswer(mod, "Key terms",
      `<div>${terms.map((t) => `<span class="tag" style="margin:0 4px 4px 0">${esc(t.term)} · ${t.count}</span>`).join("")}</div>`,
      terms.map((t) => t.term).join(", "));
  } else if (act === "questions") {
    const qs = companionQuestions(text, mod.sectionTitle, 5);
    pushAnswer(mod, "Quiz yourself",
      `<ol class="detail-steps">${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol><p class="muted">Answer aloud or on paper, then check back against the text.</p>`,
      qs.join("\n"));
  } else if (act === "cards") {
    const cards = (mod.highlights || []).slice(-8).reverse();
    if (!cards.length) return pushAnswer(mod, "Flashcards", "<p class=\"muted\">Highlight passages first — each becomes a flashcard.</p>", "none");
    pushAnswer(mod, `Flashcards (${cards.length})`,
      cards.map((c, i) => `<div class="companion-card"><strong>Q${i + 1}.</strong> ${esc(c.excerpt.slice(0, 160))}${c.excerpt.length > 160 ? "…" : ""}${c.note ? `<br><span class="muted">Your note: ${esc(c.note)}</span>` : ""}</div>`).join(""),
      cards.map((c) => c.excerpt).join("\n---\n"));
  } else if (act === "ask") {
    const q = query.toLowerCase();
    const qwords = q.split(/\s+/).filter((w) => w.length > 3);
    const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s.length > 25);
    const scored = sentences.map((s) => {
      const low = s.toLowerCase();
      let n = 0;
      for (const w of qwords) if (low.includes(w)) n++;
      return { s, n };
    }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
    if (!scored.length) {
      pushAnswer(mod, "No direct match", `<p class="muted">I could not find that in ${esc(companionContextLabel(mod.ctxShort || mod.ctx))}. Try the Key terms or Summary actions, or rephrase with words from the passage.</p>`, "no match");
      return;
    }
    pushAnswer(mod, "From the text",
      `<ul class="detail-steps">${scored.map((x) => `<li>${esc(x.s.trim().slice(0, 400))}</li>`).join("")}</ul>`,
      scored.map((x) => x.s).join("\n"));
  }
}
export function openCompanionFor(mod) {
  mod.rerender && mod.rerender();
}
