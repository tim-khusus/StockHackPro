// api/debug.js — Test crumb + fundamental
// Akses: /api/debug?ticker=BBCA  — HAPUS setelah debug!

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ticker = 'BBCA' } = req.query;
  const sym = ticker.toUpperCase().replace(/\.JK$/i,'') + '.JK';
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com/',
  };
  const out = { ticker: sym, time: new Date().toISOString() };

  // Test crumb
  try {
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: { ...H, 'Accept': 'text/html,*/*' }, redirect: 'follow'
    });
    const rawCookies = homeRes.headers.getSetCookie?.() || [];
    let cookieStr = rawCookies.length
      ? rawCookies.map(c=>c.split(';')[0]).join('; ')
      : (homeRes.headers.get('set-cookie')||'').split(/,(?=[^ ])/).map(c=>c.split(';')[0]).join('; ');
    out.cookie_count = rawCookies.length;
    out.cookie_str_len = cookieStr.length;

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...H, 'Cookie': cookieStr }
    });
    out.crumb_status = crumbRes.status;
    const crumb = (await crumbRes.text()).trim();
    out.crumb = crumb.slice(0, 30);

    if (crumb && crumb.length > 4 && !crumb.startsWith('{')) {
      // Test fundamental dengan crumb
      const MODS = 'summaryDetail,defaultKeyStatistics,financialData';
      const fRes = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${MODS}&crumb=${encodeURIComponent(crumb)}&formatted=false`,
        { headers: { ...H, 'Cookie': cookieStr } }
      );
      out.fundamental_status = fRes.status;
      if (fRes.ok) {
        const fj = await fRes.json();
        const r = fj?.quoteSummary?.result?.[0] || {};
        const ks = r.defaultKeyStatistics || {};
        const fd = r.financialData || {};
        const sd = r.summaryDetail || {};
        out.eps      = ks.trailingEps;
        out.bvps     = ks.bookValue;
        out.beta     = ks.beta;
        out.roe      = fd.returnOnEquity;
        out.pe       = sd.trailingPE || ks.trailingPE;
        out.pb       = ks.priceToBook;
        out.netMargin= fd.profitMargins;
        out.de       = fd.debtToEquity;
        out.divRate  = sd.dividendRate;
      } else {
        out.fundamental_body = await fRes.text().then(t=>t.slice(0,200));
      }
    }
  } catch(e) { out.error = e.message; }

  return res.status(200).json(out);
}
