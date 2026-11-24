// Launch Chromium for check.mjs and record.mjs, in this order:
//   1. --browser <exe> or PLAYABLE_BROWSER, when given;
//   2. Playwright's own browser, when its revision is downloaded;
//   3. the installed Microsoft Edge, then Google Chrome (Playwright channels), so a fresh shell on a machine
//      without Playwright's download still works.
// It says which one it used, since a film or a check should name the browser it ran in.
export async function launchChromium(chromium, { executablePath, args = [] } = {}) {
  if (executablePath) return report(await chromium.launch({ executablePath, args }), executablePath);
  try { return report(await chromium.launch({ args }), "Playwright's Chromium"); }
  catch (e) { if (!/Executable doesn't exist|browserType\.launch/.test(String(e.message))) throw e; }
  for (const channel of ['msedge', 'chrome']) {
    try { return report(await chromium.launch({ channel, args }), `installed ${channel === 'msedge' ? 'Edge' : 'Chrome'}`); }
    catch { /* try the next */ }
  }
  throw Error("No browser to run in: Playwright's own isn't downloaded and neither Edge nor Chrome is installed. Pass --browser <chromium exe>.");
}

function report(browser, what) {
  console.error(`browser: ${what} ${browser.version()}`);
  return browser;
}
