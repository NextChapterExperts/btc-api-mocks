const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load OpenAPI Specification directly
const openApiPath = path.join(__dirname, '..', 'openapi.json');
let openApiSpec = {};
try {
  if (fs.existsSync(openApiPath)) {
    openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
  }
} catch (e) {
  console.error("Could not load openapi.json", e);
}

// In-Memory Database & Credential Store for Demo
const CONFIG = {
  validClientId: process.env.CLIENT_ID || 'btc-demo-client',
  validClientSecret: process.env.CLIENT_SECRET || 'btc-demo-secret-2026',
  tokenExpiresInSeconds: 300 // 5 Minuten Lebensdauer für Live-Demonstration
};

// In-Memory Token & Refresh Store
const tokenStore = new Map(); // token -> { expiresAt, clientId, scope }
const refreshStore = new Map(); // refreshToken -> { clientId, scope }

// Demo Mock Data: Zählerstände (Energieversorger BTC / EWE Netz)
let meterDatabase = [
  {
    meterId: 'DE-OL-MTR-001',
    customer: 'Weser-Ems-Hallen Oldenburg',
    readingKWh: 12450.4,
    tariff: 'Gewerbe-Lastgang-15min',
    timestamp: new Date().toISOString(),
    status: 'OK'
  },
  {
    meterId: 'DE-OL-MTR-002',
    customer: 'EWE Baskets Arena',
    readingKWh: 38920.1,
    tariff: 'Sondervertrag-Sportstaette',
    timestamp: new Date().toISOString(),
    status: 'OK'
  },
  {
    meterId: 'DE-OL-MTR-003',
    customer: 'Stadtwerke Delmenhorst Übergabepunkt',
    readingKWh: 184520.0,
    tariff: 'Hochspannung-Einspeisung-Wind',
    timestamp: new Date().toISOString(),
    status: 'OK'
  }
];

// Helper: Generiere zufälligen Hex-Token
function generateToken(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2)}_${Date.now().toString(36)}`;
}

// Helper: Robuste Host-URL Bestimmung (immer HTTPS auf Vercel / Cloud)
function getBaseUrl(req) {
  const host = req.get('host');
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

// -------------------------------------------------------------
// 1. OpenAPI Raw Endpoint & CDN-basierte Swagger UI
// -------------------------------------------------------------
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const dynamicSpec = { ...openApiSpec, servers: [{ url: getBaseUrl(req) }] };
  res.json(dynamicSpec);
});

app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>BTC Smart Meter API · Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css" />
  <link rel="icon" type="image/png" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/favicon-32x32.png" sizes="32x32" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .topbar-nav { background: #0A3D62; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; color: white; }
    .topbar-nav h1 { font-size: 1.2rem; margin: 0; display: flex; align-items: center; gap: 8px; }
    .topbar-nav a { color: #38BDF8; text-decoration: none; font-size: 0.9rem; font-weight: bold; }
    .topbar-nav a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="topbar-nav">
    <h1>⚡ BTC Smart Meter API · Swagger UI</h1>
    <div>
      <a href="/" style="margin-right: 18px;">🏠 Zurück zum Cockpit & cURL</a>
      <a href="/openapi.json" target="_blank">📜 OpenAPI JSON</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>
  `);
});

// -------------------------------------------------------------
// 2. OAuth 2.0 Token & Refresh Endpoint
// -------------------------------------------------------------
app.post('/oauth/token', (req, res) => {
  let clientId = req.body.client_id;
  let clientSecret = req.body.client_secret;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('ascii');
    const [id, secret] = credentials.split(':');
    clientId = id;
    clientSecret = secret;
  }

  const grantType = req.body.grant_type;

  // Case A: Client Credentials Flow
  if (grantType === 'client_credentials') {
    if (clientId !== CONFIG.validClientId || clientSecret !== CONFIG.validClientSecret) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client ID oder Client Secret ungültig.'
      });
    }

    const accessToken = generateToken('btc_access');
    const refreshToken = generateToken('btc_refresh');
    const expiresAt = Date.now() + (CONFIG.tokenExpiresInSeconds * 1000);

    tokenStore.set(accessToken, {
      expiresAt,
      clientId,
      scope: 'meter:read meter:write'
    });

    refreshStore.set(refreshToken, {
      clientId,
      scope: 'meter:read meter:write'
    });

    console.log(`[AUTH] Client Credentials Token erteilt: ${accessToken}`);

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: CONFIG.tokenExpiresInSeconds,
      refresh_token: refreshToken,
      scope: 'meter:read meter:write'
    });
  }

  // Case B: Refresh Token Flow
  if (grantType === 'refresh_token') {
    const incomingRefreshToken = req.body.refresh_token;
    if (!incomingRefreshToken || !refreshStore.has(incomingRefreshToken)) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Der angegebene Refresh-Token ist unbekannt oder abgelaufen.'
      });
    }

    const sessionData = refreshStore.get(incomingRefreshToken);
    refreshStore.delete(incomingRefreshToken); // Rotation

    const newAccessToken = generateToken('btc_access');
    const newRefreshToken = generateToken('btc_refresh');
    const expiresAt = Date.now() + (CONFIG.tokenExpiresInSeconds * 1000);

    tokenStore.set(newAccessToken, {
      expiresAt,
      clientId: sessionData.clientId,
      scope: sessionData.scope
    });

    refreshStore.set(newRefreshToken, {
      clientId: sessionData.clientId,
      scope: sessionData.scope
    });

    console.log(`[AUTH] Token REFRESH erfolgreich! Neuer Token: ${newAccessToken}`);

    return res.json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: CONFIG.tokenExpiresInSeconds,
      refresh_token: newRefreshToken,
      scope: sessionData.scope
    });
  }

  return res.status(400).json({
    error: 'unsupported_grant_type',
    error_description: 'Unterstützt werden nur client_credentials und refresh_token.'
  });
});

// -------------------------------------------------------------
// 3. Auth Middleware: Reiner OAuth 2.0 Bearer Token Check
// -------------------------------------------------------------
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (tokenStore.has(token)) {
      const info = tokenStore.get(token);
      if (Date.now() > info.expiresAt) {
        tokenStore.delete(token);
        return res.status(401).json({
          error: 'token_expired',
          error_description: 'Der Bearer Token ist abgelaufen. Bitte Refresh Token nutzen.'
        });
      }
      req.authMethod = 'Bearer';
      req.authInfo = info;
      return next();
    }
  }

  return res.status(401).json({
    error: 'unauthorized',
    error_description: 'Zugriff verweigert. Gültiger OAuth 2.0 Bearer-Token erforderlich.'
  });
}

// -------------------------------------------------------------
// 4. Business Endpoints: Smart Meter Readings
// -------------------------------------------------------------
app.get('/api/v1/smartmeters', authenticate, (req, res) => {
  res.json({
    d: {
      results: meterDatabase,
      count: meterDatabase.length,
      authMethodUsed: req.authMethod
    }
  });
});

app.post('/api/v1/smartmeters', authenticate, (req, res) => {
  const { meterId, customer, readingKWh, tariff } = req.body;
  if (!meterId || readingKWh === undefined) {
    return res.status(400).json({ error: 'meterId und readingKWh sind Pflichtfelder.' });
  }

  const newEntry = {
    meterId,
    customer: customer || 'Unbekannter Kunde',
    readingKWh: Number(readingKWh),
    tariff: tariff || 'Standardtarif',
    timestamp: new Date().toISOString(),
    status: 'OK'
  };

  meterDatabase.push(newEntry);
  res.status(201).json({
    message: 'Zählerstand erfolgreich verbucht.',
    entry: newEntry
  });
});

// -------------------------------------------------------------
// 5. Interaktives Dashboard mit Reitern
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const hostUrl = getBaseUrl(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BTC Smart Meter API · Cockpit</title>
  <style>
    :root {
      --sap-blue: #0A3D62;
      --sap-accent: #0070F2;
      --bg-gray: #F4F6F9;
      --card-bg: #FFFFFF;
      --text-main: #1C2430;
      --code-bg: #1E293B;
      --code-text: #38BDF8;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg-gray);
      color: var(--text-main);
      margin: 0;
      padding: 30px 20px;
    }
    .container {
      max-width: 1050px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0A3D62 0%, #0070F2 100%);
      color: white;
      padding: 30px;
    }
    .header h1 { margin: 0 0 8px 0; font-size: 1.8rem; }
    .header p { margin: 0; opacity: 0.9; font-size: 1rem; }
    .links-bar {
      display: flex;
      gap: 12px;
      margin-top: 18px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.15);
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.9rem;
      border: 1px solid rgba(255,255,255,0.3);
      transition: all 0.2s;
    }
    .btn:hover { background: rgba(255,255,255,0.3); }
    .btn-primary { background: #EBF8FF; color: #0070F2; border-color: #BAE6FD; }
    .btn-primary:hover { background: #BAE6FD; }
    
    .body-content { padding: 30px; }
    
    /* Info Cards Grid: Ausschließlich OAuth2 & Developer Key */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 30px;
    }
    .info-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 16px;
    }
    .info-card h4 { margin: 0 0 6px 0; color: #64748B; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-card code { font-size: 0.9rem; color: #0F172A; font-weight: bold; word-break: break-all; }
    .info-card p { margin: 4px 0 0 0; font-size: 0.75rem; color: #64748B; }

    /* Interactive Developer Key Input Card */
    .devkey-card {
      background: #F0FDF4;
      border: 2px solid #86EFAC;
      border-radius: 8px;
      padding: 16px;
    }
    .devkey-card h4 { margin: 0 0 6px 0; color: #166534; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold; }
    .devkey-input-row { display: flex; gap: 8px; margin-top: 8px; }
    .devkey-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
    }
    .devkey-input:focus { outline: none; border-color: #16A34A; }

    /* Tabs Navigation */
    .tabs-header {
      display: flex;
      border-bottom: 2px solid #E2E8F0;
      margin-bottom: 24px;
      gap: 8px;
      overflow-x: auto;
    }
    .tab-btn {
      padding: 12px 20px;
      border: none;
      background: none;
      font-size: 1rem;
      font-weight: 600;
      color: #64748B;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .tab-btn:hover { color: var(--sap-accent); }
    .tab-btn.active {
      color: var(--sap-accent);
      border-bottom-color: var(--sap-accent);
    }

    /* Tab Panes */
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* Code Block Container with Copy Button */
    .code-box {
      background: var(--code-bg);
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .code-box-header {
      background: #0F172A;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #94A3B8;
      font-size: 0.85rem;
      font-family: monospace;
    }
    .copy-btn {
      background: #334155;
      color: #F8FAFC;
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: bold;
      transition: background 0.2s;
    }
    .copy-btn:hover { background: #475569; }
    .copy-btn.copied { background: #10B981; }
    pre {
      margin: 0;
      padding: 16px;
      overflow-x: auto;
      color: var(--code-text);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.88rem;
      line-height: 1.5;
    }
    
    .note {
      background: #EFF6FF;
      border-left: 4px solid var(--sap-accent);
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 20px;
      font-size: 0.9rem;
      color: #1E3A8A;
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="header">
      <h1>⚡ BTC Smart Meter Energy Services API</h1>
      <p>Live Mock-Schnittstelle für SAP BTP Integration Cell, Developer Hub & OAuth2 Demonstration</p>
      <div class="links-bar">
        <a href="/docs" class="btn btn-primary">📖 Interaktive Swagger UI</a>
        <a href="/openapi.json" target="_blank" class="btn">📜 OpenAPI 3.0 Spezifikation</a>
      </div>
    </div>

    <div class="body-content">
      <!-- Info Cards Grid: Nur OAuth2 Daten + Developer Key Feld -->
      <div class="grid">
        <div class="info-card">
          <h4>OAuth2 Client ID</h4>
          <code>btc-demo-client</code>
          <p>Für BTP Destination & Token-Abruf</p>
        </div>
        <div class="info-card">
          <h4>OAuth2 Client Secret</h4>
          <code>btc-demo-secret-2026</code>
          <p>Geheimer Schlüssel für Token-Server</p>
        </div>
        <div class="info-card">
          <h4>OAuth2 Token URL</h4>
          <code>${hostUrl}/oauth/token</code>
          <p>POST-Endpunkt für Token & Refresh</p>
        </div>
        
        <!-- Interaktives Developer Key Feld -->
        <div class="devkey-card">
          <h4>🔑 Developer Key (aus Developer Hub)</h4>
          <p>Trage deinen Key aus dem Developer Hub hier ein, um die cURLs unten zu personalisieren:</p>
          <div class="devkey-input-row">
            <input type="text" id="devKeyInput" class="devkey-input" placeholder="DEIN_DEVELOPER_KEY_AUS_DEV_HUB" oninput="updateDevKey(this.value)" />
          </div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="tabs-header">
        <button class="tab-btn active" onclick="switchTab('curl')">💻 cURL & Terminal Aufrufe</button>
        <button class="tab-btn" onclick="switchTab('destination')">☁️ SAP BTP Destination Konfiguration</button>
        <button class="tab-btn" onclick="switchTab('developer-key-policy')">🛡️ Developer Key Konfiguration (Policy)</button>
      </div>

      <!-- TAB 1: cURL -->
      <div id="tab-curl" class="tab-pane active">
        <div class="note">
          💡 <b>Direkter Backend-Test via OAuth2:</b> Holt den Token von der Schnittstelle und ruft die Zählerdaten ab.
        </div>

        <h3>1. Token abholen (OAuth 2.0 Client Credentials)</h3>
        <div class="code-box">
          <div class="code-box-header">
            <span>POST ${hostUrl}/oauth/token</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code>curl -L -X POST "${hostUrl}/oauth/token" \\
     -H "Content-Type: application/x-www-form-urlencoded" \\
     -d "grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026"</code></pre>
        </div>

        <h3>2. Zählerdaten abrufen mit Bearer Token</h3>
        <div class="code-box">
          <div class="code-box-header">
            <span>GET ${hostUrl}/api/v1/smartmeters</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code>curl -L -X GET "${hostUrl}/api/v1/smartmeters" \\
     -H "Authorization: Bearer &lt;ACCESS_TOKEN_HIER_EINSETZEN&gt;"</code></pre>
        </div>

        <h3>3. Token live refreshen (Refresh Token Flow)</h3>
        <p style="font-size: 0.9rem; color: #64748B;">Zeige vor der Gruppe, wie der ablaufende Token nahtlos durch den <code>refresh_token</code> erneuert wird:</p>
        <div class="code-box">
          <div class="code-box-header">
            <span>POST ${hostUrl}/oauth/token (grant_type=refresh_token)</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code>curl -L -X POST "${hostUrl}/oauth/token" \\
     -H "Content-Type: application/x-www-form-urlencoded" \\
     -d "grant_type=refresh_token&refresh_token=&lt;REFRESH_TOKEN_HIER_EINSETZEN&gt;"</code></pre>
        </div>

        <h3>4. Integration Cell Ingress-Aufruf (mit personalisiertem Developer Key)</h3>
        <p style="font-size: 0.9rem; color: #64748B;">So ruft der Konsument dein <b>API-Artefakt auf der Integration Cell</b> auf:</p>
        <div class="code-box">
          <div class="code-box-header">
            <span>GET &lt;INTEGRATION_CELL_URL&gt;/smartmeters</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code id="curlCellExample">curl -L -X GET "https://&lt;DEINE_INTEGRATION_CELL_RUNTIME_URL&gt;/api/v1/smartmeters" \\
     -H "apikey: DEIN_DEVELOPER_KEY_AUS_DEV_HUB"</code></pre>
        </div>
      </div>

      <!-- TAB 2: SAP BTP Destination -->
      <div id="tab-destination" class="tab-pane">
        <div class="note">
          ⚙️ <b>SAP BTP Cockpit:</b> Lege unter <code>Connectivity ➔ Destinations</code> im BTP Subaccount eine neue HTTP-Destination an.
        </div>

        <div class="code-box">
          <div class="code-box-header">
            <span>BTP Destination Configuration (Properties)</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code>Name = BTC_SMARTMETER_OAUTH
Type = HTTP
Description = BTC Smart Meter REST API mit OAuth2 Client Credentials
URL = ${hostUrl}/api/v1/
ProxyType = Internet
Authentication = OAuth2ClientCredentials
tokenServiceURL = ${hostUrl}/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026

# ZWINGEND FÜR INTEGRATION CELL (Synchronisation in K8s Pod):
IntegrationCell.Include = true</code></pre>
        </div>
      </div>

      <!-- TAB 3: Developer Key Konfiguration (Policy) -->
      <div id="tab-developer-key-policy" class="tab-pane">
        <div class="note">
          🛡️ <b>Developer Key Konfiguration in der Integration Cell:</b><br/>
          Der Developer Key identifiziert den Anrufer an der Pforte der Integration Cell. Er wird gegen das Produkt-Abonnement im Developer Hub geprüft.
        </div>

        <h3>1. Authentication Policy (Developer Key aus Header extrahieren)</h3>
        <div class="code-box">
          <div class="code-box-header">
            <span>Policy: Authentication_ExtractDevKey.xml</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code>&lt;Authentication async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;ExtractionPolicy&gt;
        &lt;Source&gt;request&lt;/Source&gt;
        &lt;Header name="apikey"/&gt;
    &lt;/ExtractionPolicy&gt;
&lt;/Authentication&gt;</code></pre>
        </div>

        <h3>2. Authorization Policy (Gegen Developer Hub validieren)</h3>
        <div class="code-box">
          <div class="code-box-header">
            <span>Policy: Authorization_ValidateDevHub.xml</span>
            <button class="copy-btn" onclick="copyCode(this)">Kopieren</button>
          </div>
          <pre><code>&lt;Authorization async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;VerificationPolicy&gt;
        &lt;Type&gt;APIKey&lt;/Type&gt;
        &lt;Source&gt;request.header.apikey&lt;/Source&gt;
        &lt;!-- Prüft die Gültigkeit des Schlüssels gegen die Developer Hub Application --&gt;
    &lt;/VerificationPolicy&gt;
&lt;/Authorization&gt;</code></pre>
        </div>
      </div>

    </div>
  </div>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      
      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      if (activeBtn) activeBtn.classList.add('active');
      
      const pane = document.getElementById('tab-' + tabId);
      if (pane) pane.classList.add('active');
    }

    function copyCode(btn) {
      const pre = btn.closest('.code-box').querySelector('pre code');
      if (!pre) return;
      navigator.clipboard.writeText(pre.innerText).then(() => {
        btn.innerText = "✓ Kopiert!";
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = "Kopieren";
          btn.classList.remove('copied');
        }, 2000);
      });
    }

    function updateDevKey(val) {
      const key = val.trim() || 'DEIN_DEVELOPER_KEY_AUS_DEV_HUB';
      const codeBlock = document.getElementById('curlCellExample');
      if (codeBlock) {
        codeBlock.innerText = 'curl -L -X GET "https://<DEINE_INTEGRATION_CELL_RUNTIME_URL>/api/v1/smartmeters" \\\\\\n     -H "apikey: ' + key + '"';
      }
    }
  </script>
</body>
</html>
  `);
});

// Export for Vercel Serverless
module.exports = app;

// Local runner
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Swagger UI auf http://localhost:${PORT}/docs`);
  });
}
