/**
 * SERVEUR — Testeur de site (interface web + bots Playwright)
 * -------------------------------------------------------------
 * INSTALLATION (une seule fois) :
 *   npm init -y
 *   npm install playwright
 *   npx playwright install chromium
 *
 * LANCEMENT :
 *   node server.js
 *   -> ouvre ensuite http://localhost:3000 dans ton navigateur
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const const PORT = process.env.PORT || 3000;


function testValueFor({ type, name, id, placeholder }) {
  const t = (type || "text").toLowerCase();
  const label = `${name || ""} ${id || ""} ${placeholder || ""}`.toLowerCase();
  if (t === "email" || label.includes("mail")) return "bot.test@example.com";
  if (t === "tel" || label.includes("phone") || label.includes("tel")) return "0600000000";
  if (t === "number") return "1";
  if (t === "checkbox" || t === "radio") return null;
  if (label.includes("nom") || label.includes("name")) return "Bot Testeur";
  if (label.includes("message") || label.includes("commentaire")) return "Ceci est un test automatisé.";
  return "Test";
}

async function runBot(botId, url, browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const steps = [];
  const log = (msg) => steps.push(msg);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    log(`Page chargée : ${url}`);

    const forms = await page.$$("form");
    if (forms.length === 0) {
      log("Aucun formulaire trouvé sur la page.");
      await context.close();
      return { botId, status: "no-form", steps };
    }

    const form = forms[0];
    const fields = await form.$$("input, textarea, select");
    let filled = 0;

    for (const field of fields) {
      const tag = await field.evaluate((el) => el.tagName.toLowerCase());
      const type = await field.evaluate((el) => el.type || "");
      const name = await field.evaluate((el) => el.name || "");
      const id = await field.evaluate((el) => el.id || "");
      const placeholder = await field.evaluate((el) => el.placeholder || "");

      if (["submit", "button", "hidden"].includes(type)) continue;

      if (type === "checkbox" || type === "radio") {
        await field.check().catch(() => {});
        filled++;
        continue;
      }
      if (tag === "select") {
        const options = await field.$$eval("option", (opts) => opts.map((o) => o.value).filter(Boolean));
        if (options.length) await field.selectOption(options[0]).catch(() => {});
        filled++;
        continue;
      }
      const value = testValueFor({ type, name, id, placeholder });
      if (value) {
        await field.fill(value).catch(() => {});
        filled++;
      }
    }
    log(`${filled} champ(s) rempli(s).`);

    const submitBtn = await form.$('button[type="submit"], input[type="submit"], button:not([type])');
    if (submitBtn) {
      await submitBtn.click({ timeout: 5000 }).catch((e) => log(`Clic échoué : ${e.message}`));
      await page.waitForTimeout(1200);
      log("Formulaire soumis.");
      await context.close();
      return { botId, status: "submitted", steps };
    } else {
      log("Aucun bouton d'envoi trouvé.");
      await context.close();
      return { botId, status: "no-submit-button", steps };
    }
  } catch (err) {
    log(`Erreur : ${err.message}`);
    await context.close();
    return { botId, status: "error", steps };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { url, count } = JSON.parse(body);
        const n = Math.min(10, Math.max(1, parseInt(count, 10) || 1));

        if (!url || !/^https?:\/\//.test(url)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "URL invalide (doit commencer par http:// ou https://)" }));
          return;
        }

        const browser = await chromium.launch({ headless: true });
        const results = await Promise.all(
          Array.from({ length: n }, (_, i) => runBot(i + 1, url, browser))
        );
        await browser.close();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Serveur lancé : http://localhost:${PORT}`);
});
