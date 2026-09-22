const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Support JSON, URL-Encoded and XML (for SOAP)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['text/xml', 'application/xml', 'application/soap+xml'] }));

const setupOData = require('./odata_routes');

// Load OpenAPI Specification
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

// In-Memory Request & Audit Log (Mit /tmp/ File-Backing für Vercel Serverless Instanzen)
const AUDIT_FILE = path.join('/tmp', 'btc_audit_logs.json');
function loadAuditLogs() {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}
  return [];
}

function saveAuditLogs(logs) {
  try {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs.slice(0, 30)), 'utf8');
  } catch (e) {}
}

const auditLogs = loadAuditLogs();
function recordAuditLog(entry) {
  const newLog = {
    id: 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    ...entry
  };
  auditLogs.unshift(newLog);
  if (auditLogs.length > 30) auditLogs.pop();
  saveAuditLogs(auditLogs);
}

// Demo Mock Data: Zählerstände (Energieversorger BTC / Oldenburg / EWE Netz)
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
  },
  {
    meterId: 'DE-OL-MTR-004',
    customer: 'Klinikum Oldenburg Notstrom-Einspeisung',
    readingKWh: 64100.5,
    tariff: 'Krankenhaus-KRITIS-Garantie',
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

// Hook OData $metadata middleware
setupOData(app, getBaseUrl, meterDatabase);

// =============================================================
// BTP INBOUND TOKEN & INTEGRATION CELL GATEWAY
// =============================================================
const BTP_CREDENTIALS = {
  devhub: {
    id: 'devhub',
    label: 'Weg 3: Developer Key (Integration Cell + Developer Hub)',
    tokenUrl: process.env.BTP_DEVHUB_TOKEN_URL || 'https://872f920dtrial.authentication.us10.hana.ondemand.com/oauth/token',
    clientId: process.env.BTP_DEVHUB_CLIENT_ID || 'sb-dh-3b72cd96-320d-4551-9fe8-9d9c6e30349a!b711904|it-rt-872f920dtrial!b26655',
    clientSecret: process.env.BTP_DEVHUB_CLIENT_SECRET || 'a8d3e87a-1e53-4f99-8620-44f7d9b443b4$CLkv5lmOWJUnk6wEKHgMmdJpPYEzrElVzw1wuvFE13o=',
    endpoint: process.env.BTP_DEVHUB_ENDPOINT || 'https://872f920dtrial-d58ffe5a9522426e865d4e1cc662a85c.a.integration.cloud.sap/demo'
  },
  servicekey: {
    id: 'servicekey',
    label: 'Weg 3 Fallback: Service Key (Process Integration Runtime it-rt)',
    tokenUrl: process.env.BTP_SVC_TOKEN_URL || 'https://872f920dtrial.authentication.us10.hana.ondemand.com/oauth/token',
    clientId: process.env.BTP_SVC_CLIENT_ID || 'sb-f581317a-f129-40a9-a0fb-cdf54f81e053!b711904|it-rt-872f920dtrial!b26655',
    clientSecret: process.env.BTP_SVC_CLIENT_SECRET || '4452ad3d-2f32-4fa2-b70a-05c476416f3f$GrETQG-ri2w2Cdl73s4lJ0XWtomSPU5Iu46MLF025ko=',
    endpoint: process.env.BTP_SVC_ENDPOINT || 'https://872f920dtrial-d58ffe5a9522426e865d4e1cc662a85c.a.integration.cloud.sap/demo'
  },
  apim_classic: {
    id: 'apim_classic',
    label: 'Weg 1: Klassisch APIM Nativ (KVM + Hilfsproxy /get/oauth)',
    tokenUrl: process.env.BTP_APIM_TOKEN_URL || 'https://872f920dtrial.authentication.us10.hana.ondemand.com/oauth/token',
    clientId: process.env.BTP_APIM_CLIENT_ID || 'sb-apim-classic-kvm!b711904|apim-rt!b12001',
    clientSecret: process.env.BTP_APIM_CLIENT_SECRET || 'mock-apim-kvm-secret-998822==',
    endpoint: process.env.BTP_APIM_ENDPOINT || 'https://872f920dtrial-d58ffe5a9522426e865d4e1cc662a85c.a.integration.cloud.sap/meter-service'
  },
  apim_hybrid: {
    id: 'apim_hybrid',
    label: 'Weg 2: Hybrid APIM + Cloud Integration (Shared Token-iFlow)',
    tokenUrl: process.env.BTP_HYBRID_TOKEN_URL || 'https://872f920dtrial.authentication.us10.hana.ondemand.com/oauth/token',
    clientId: process.env.BTP_HYBRID_CLIENT_ID || 'sb-hybrid-cpi-flow!b711904|it-rt-872f920dtrial!b26655',
    clientSecret: process.env.BTP_HYBRID_CLIENT_SECRET || 'mock-cpi-secmat-secret-771133==',
    endpoint: process.env.BTP_HYBRID_ENDPOINT || 'https://872f920dtrial-d58ffe5a9522426e865d4e1cc662a85c.a.integration.cloud.sap/cpi/oauth/meter-service'
  }
};

// Endpoint to fetch BTP XSUAA Inbound Token (devhub or servicekey)
app.all('/api/btp/token', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const keyType = req.body?.keyType || req.query?.keyType || 'devhub';
  const creds = BTP_CREDENTIALS[keyType] || BTP_CREDENTIALS.devhub;

  const tokenUrl = req.body?.tokenUrl || req.query?.tokenUrl || creds.tokenUrl;
  const clientId = req.body?.clientId || req.query?.clientId || creds.clientId;
  const clientSecret = req.body?.clientSecret || req.query?.clientSecret || creds.clientSecret;

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    if (!response.ok) {
      // Falls noch kein eigener XSUAA-Mandant für Weg 1 oder Weg 2 verknüpft ist, erzeuge ein valides Test-Token
      if (keyType === 'apim_classic' || keyType === 'apim_hybrid') {
        const dummyToken = generateToken('ey_' + keyType);
        return res.json({
          keyType,
          access_token: dummyToken,
          token_type: 'bearer',
          expires_in: 3600,
          scope: keyType === 'apim_classic' ? 'apim.read meter.read' : 'cpi.read meter.read',
          jti: 'jti_' + Math.random().toString(36).substring(2),
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          simulated: true
        });
      }
      return res.status(response.status).json({ error: 'BTP XSUAA Error', details: data });
    }

    return res.json({
      keyType,
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: data.expires_in || 3599,
      scope: data.scope,
      jti: data.jti,
      expires_at: new Date(Date.now() + (data.expires_in || 3599) * 1000).toISOString()
    });
  } catch (err) {
    if (keyType === 'apim_classic' || keyType === 'apim_hybrid') {
      const dummyToken = generateToken('ey_' + keyType);
      return res.json({
        keyType,
        access_token: dummyToken,
        token_type: 'bearer',
        expires_in: 3600,
        scope: keyType === 'apim_classic' ? 'apim.read meter.read' : 'cpi.read meter.read',
        jti: 'jti_' + Math.random().toString(36).substring(2),
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        simulated: true
      });
    }
    return res.status(500).json({ error: 'Failed to connect to BTP XSUAA', message: err.message });
  }
});

// Endpoint to fetch recent audit logs as JSON (für Live-Dashboard & Polling)
app.get('/api/audit', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const currentLogs = loadAuditLogs();
  res.json({
    totalLogs: currentLogs.length,
    serverTime: new Date().toISOString(),
    logs: currentLogs
  });
});

// Endpoint to invoke BTP Integration Cell directly via proxy
app.all('/api/btp/invoke', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const keyType = req.body?.keyType || req.query?.keyType || 'devhub';
  const creds = BTP_CREDENTIALS[keyType] || BTP_CREDENTIALS.devhub;
  const endpointUrl = req.body?.endpointUrl || req.query?.endpointUrl || creds.endpoint;
  let token = req.body?.token || req.query?.token;

  try {
    const startTime = Date.now();
    if (!token) {
      const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
      const tokenResp = await fetch(creds.tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      const tokenData = await tokenResp.json();
      token = tokenData.access_token;
    }

    const icResp = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const durationMs = Date.now() - startTime;
    const contentType = icResp.headers.get('content-type') || '';
    let responseData;
    if (contentType.includes('application/json')) {
      responseData = await icResp.json();
    } else {
      responseData = await icResp.text();
    }

    // Wenn Weg 1 oder Weg 2 aufgerufen wird und das Artefakt auf dem BTP-Tenant noch nicht deployed ist (404 Not Found),
    // schalten wir für den didaktischen Durchstich automatisch auf die Live-Simulation um!
    if ((keyType === 'apim_classic' || keyType === 'apim_hybrid') && icResp.status === 404) {
      const isClassic = keyType === 'apim_classic';
      const simClientId = isClassic ? 'sb-apim-classic-kvm' : 'sb-hybrid-cpi-flow';
      const simAuthMethod = isClassic ? 'Weg 1: APIM KVM + /get/oauth Cache' : 'Weg 2: Hybrid APIM + CPI Shared iFlow';

      recordAuditLog({
        status: 200,
        client: simClientId,
        authMethod: simAuthMethod,
        tokenPreview: 'ey_simulated_' + keyType + '_' + Date.now().toString(36) + '...',
        path: '/api/v1/smartmeters',
        method: 'GET',
        userAgent: isClassic ? 'SAP APIM Gateway Proxy (LocalTargetConnection)' : 'SAP Cloud Integration HTTP-Adapter',
        source: isClassic ? 'APIM Gateway KVM Cache' : 'BTP Security Material (Keystore)'
      });

      return res.json({
        keyType,
        simulated: true,
        status: 200,
        statusText: 'OK (Gateway Durchstich)',
        durationMs: isClassic ? 4 : 12,
        server: isClassic ? 'sap-apim-gateway' : 'sap-cpi-worker',
        correlationId: 'corr-' + Date.now().toString(36),
        artifactType: isClassic ? 'apim-proxy' : 'cpi-iflow',
        data: {
          note: isClassic 
            ? 'Weg 1 (Klassisch APIM): Token über Hilfsproxy /get/oauth & KVM bezogen, im RAM gecacht und mit Bearer-Header autorisiert an Mock übergeben.' 
            : 'Weg 2 (Hybrid APIM + CPI): Token über Shared iFlow aus BTP Security Material bezogen, im APIM-RAM gecacht und autorisiert an Mock übergeben.',
          d: {
            results: meterDatabase,
            count: meterDatabase.length,
            architecturePath: isClassic ? 'Weg 1: Klassisch APIM Nativ' : 'Weg 2: Hybrid APIM + iFlow'
          }
        }
      });
    }

    return res.json({
      keyType,
      status: icResp.status,
      statusText: icResp.statusText,
      durationMs,
      server: icResp.headers.get('server'),
      correlationId: icResp.headers.get('x-correlationid') || icResp.headers.get('x-request-id'),
      artifactType: icResp.headers.get('sap_artifacttype'),
      data: responseData
    });
  } catch (err) {
    // Falls ein Pfad aufgerufen wird (z. B. Weg 1 APIM oder Weg 2 Hybrid), der noch nicht physisch im Kunden-BTP-Tenant provisioniert ist:
    // Schalte auf didaktische Live-Simulation um, rufe das Mock-Backend direkt ab und erfasse das Event im Audit-Log!
    if (keyType === 'apim_classic' || keyType === 'apim_hybrid') {
      const isClassic = keyType === 'apim_classic';
      const simClientId = isClassic ? 'sb-apim-classic-kvm' : 'sb-hybrid-cpi-flow';
      const simAuthMethod = isClassic ? 'Weg 1: APIM KVM + /get/oauth Cache' : 'Weg 2: Hybrid APIM + CPI Shared iFlow';
      
      recordAuditLog({
        status: 200,
        client: simClientId,
        authMethod: simAuthMethod,
        tokenPreview: 'ey_simulated_' + keyType + '_' + Date.now().toString(36) + '...',
        path: '/api/v1/smartmeters',
        method: 'GET',
        userAgent: isClassic ? 'SAP APIM Gateway Proxy (LocalTargetConnection)' : 'SAP Cloud Integration HTTP-Adapter',
        source: isClassic ? 'APIM Gateway KVM Cache' : 'BTP Security Material (Keystore)'
      });

      return res.json({
        keyType,
        simulated: true,
        status: 200,
        statusText: 'OK (Simulated Gateway Durchstich)',
        durationMs: isClassic ? 4 : 12,
        server: isClassic ? 'sap-apim-gateway' : 'sap-cpi-worker',
        correlationId: 'corr-' + Date.now().toString(36),
        artifactType: isClassic ? 'apim-proxy' : 'cpi-iflow',
        data: {
          note: isClassic 
            ? 'Weg 1 (Klassisch APIM): Token über Hilfsproxy /get/oauth & KVM bezogen, im RAM gecacht und mit Bearer-Header autorisiert an Mock übergeben.' 
            : 'Weg 2 (Hybrid APIM + CPI): Token über Shared iFlow aus BTP Security Material bezogen, im APIM-RAM gecacht und autorisiert an Mock übergeben.',
          d: {
            results: meterDatabase,
            count: meterDatabase.length,
            architecturePath: isClassic ? 'Weg 1: Klassisch APIM Nativ' : 'Weg 2: Hybrid APIM + iFlow'
          }
        }
      });
    }

    return res.status(500).json({ error: 'Failed to invoke Integration Suite', message: err.message });
  }
});

// =============================================================
// 1. SCHNITTSTELLE 1: REST API (OpenAPI 3.0 & OAuth2)
// =============================================================

// OpenAPI Raw Endpoint & CDN-basierte Swagger UI
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
    <h1>Schnittstelle 1: REST &amp; OAuth 2.0 (Swagger UI)</h1>
    <div>
      <a href="/" style="margin-right: 18px;">Zurück zur Übersicht</a>
      <a href="/openapi.json" target="_blank" rel="noopener noreferrer">OpenAPI JSON</a>
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

// OAuth 2.0 Token & Refresh Endpoint
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

// OAuth2 Auth Middleware (Serverless-kompatibel & BTP Passthrough Support)
function authenticateOAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();

    // 1. Lokaler In-Memory Token Store
    if (tokenStore.has(token)) {
      const info = tokenStore.get(token);
      if (Date.now() > info.expiresAt) {
        tokenStore.delete(token);
        recordAuditLog({
          status: 401,
          client: info.clientId || 'Unknown',
          authMethod: 'Expired Token',
          tokenPreview: token.take ? token.take(20) + '...' : token.substring(0, 20) + '...',
          path: req.originalUrl || req.url,
          method: req.method,
          userAgent: req.get('user-agent') || 'Unknown',
          source: 'Local Store (Expired)'
        });
        return res.status(401).json({
          error: 'token_expired',
          error_description: 'Der Bearer Token ist abgelaufen. Bitte Refresh Token nutzen.'
        });
      }
      req.authMethod = 'Bearer';
      req.authInfo = info;
      recordAuditLog({
        status: 200,
        client: info.clientId || 'btc-demo-client',
        authMethod: 'OAuth2 Bearer (Local Session)',
        tokenPreview: token.substring(0, 25) + '...',
        path: req.originalUrl || req.url,
        method: req.method,
        userAgent: req.get('user-agent') || 'Unknown',
        source: 'BTP Destination / Token Store'
      });
      return next();
    }

    // 2. Serverless Stateless-Fallback für lokal generierte Tokens (z. B. via BTP Destination)
    if (token.startsWith('btc_access_')) {
      req.authMethod = 'Bearer (Mock Provider)';
      req.authInfo = { clientId: 'btc-demo-client', scope: 'meter:read meter:write' };
      recordAuditLog({
        status: 200,
        client: 'btc-demo-client (SAP BTP Destination: BTC_UTILITY_MOCK_API)',
        authMethod: 'OAuth2 Client Credentials (BTP Destination)',
        tokenPreview: token.substring(0, 28) + '...',
        path: req.originalUrl || req.url,
        method: req.method,
        userAgent: req.get('user-agent') || 'SAP Cloud Platform Integration',
        source: 'SAP BTP Destination Service'
      });
      return next();
    }

    // 3. Von SAP BTP / Integration Cell weitergeleitete XSUAA JWT-Tokens
    if (token.startsWith('eyJ') && token.includes('.')) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.exp && (Date.now() / 1000) > payload.exp) {
            recordAuditLog({
              status: 401,
              client: payload.client_id || payload.user_name || 'Expired JWT',
              authMethod: 'BTP XSUAA JWT (Expired)',
              tokenPreview: token.substring(0, 25) + '...',
              path: req.originalUrl || req.url,
              method: req.method,
              userAgent: req.get('user-agent') || 'Unknown',
              source: 'SAP BTP XSUAA'
            });
            return res.status(401).json({
              error: 'token_expired',
              error_description: 'Der BTP XSUAA JWT-Token ist abgelaufen.'
            });
          }
          if (payload.iss && (payload.iss.includes('authentication') || payload.iss.includes('ondemand.com') || payload.client_id)) {
            const detectedClient = payload.client_id || payload.user_name || payload.sub || 'SAP BTP Service Client';
            req.authMethod = 'Bearer (BTP XSUAA JWT)';
            req.authInfo = { clientId: detectedClient, scope: payload.scope };
            recordAuditLog({
              status: 200,
              client: detectedClient,
              authMethod: 'BTP XSUAA JWT (' + (payload.grant_type || 'client_credentials') + ')',
              tokenPreview: token.substring(0, 25) + '...',
              path: req.originalUrl || req.url,
              method: req.method,
              userAgent: req.get('user-agent') || 'SAP Cloud Integration',
              source: payload.iss
            });
            return next();
          }
        }
      } catch (e) {
        // Fall through zu 401
      }
    }
  }

  recordAuditLog({
    status: 401,
    client: 'Unauthenticated Anonymous',
    authMethod: 'None / Invalid',
    tokenPreview: authHeader ? authHeader.substring(0, 20) + '...' : 'No Auth Header',
    path: req.originalUrl || req.url,
    method: req.method,
    userAgent: req.get('user-agent') || 'Unknown',
    source: req.ip || 'Unknown IP'
  });

  return res.status(401).json({
    error: 'unauthorized',
    error_description: 'Zugriff verweigert. Gültiger OAuth 2.0 Bearer-Token erforderlich.'
  });
}

// REST Endpunkte
app.get('/api/v1/smartmeters', authenticateOAuth, (req, res) => {
  res.json({
    d: {
      results: meterDatabase,
      count: meterDatabase.length,
      authMethodUsed: req.authMethod
    }
  });
});

app.post('/api/v1/smartmeters', authenticateOAuth, (req, res) => {
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

// =============================================================
// 2. SCHNITTSTELLE 2: SAP OData v2 Service (IS-U Utility Readings)
// =============================================================

// OData v2 Service Root (öffentlich zur Service Discovery)
app.get('/odata/v2/utility/', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    d: {
      EntitySets: ["MeterReadingSet", "CustomerContractSet"]
    }
  });
});

// OData v2 EntitySet (Geschützt per OAuth2 Bearer Token)
app.get('/odata/v2/utility/MeterReadingSet', authenticateOAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const filter = req.query.$filter;
  let data = meterDatabase.map(m => ({
    __metadata: {
      id: `${getBaseUrl(req)}/odata/v2/utility/MeterReadingSet('${m.meterId}')`,
      uri: `${getBaseUrl(req)}/odata/v2/utility/MeterReadingSet('${m.meterId}')`,
      type: "BTC_UTILITY_ISU_SRV.MeterReading"
    },
    MeterId: m.meterId,
    Customer: m.customer,
    ReadingKWh: m.readingKWh.toString(),
    Tariff: m.tariff,
    Status: m.status
  }));

  if (filter && filter.includes("MeterId eq '")) {
    const id = filter.split("MeterId eq '")[1].split("'")[0];
    data = data.filter(d => d.MeterId === id);
  }

  res.json({
    d: {
      results: data
    }
  });
});

// OData v2 Single Entity (Geschützt per OAuth2 Bearer Token)
app.get('/odata/v2/utility/MeterReadingSet\\(\':id\'\\)', authenticateOAuth, (req, res) => {
  const id = req.params.id;
  const item = meterDatabase.find(m => m.meterId === id);
  if (!item) {
    return res.status(404).json({ error: { code: "404", message: { value: "Zähler nicht gefunden." } } });
  }
  res.setHeader('Content-Type', 'application/json');
  res.json({
    d: {
      __metadata: {
        id: `${getBaseUrl(req)}/odata/v2/utility/MeterReadingSet('${item.meterId}')`,
        uri: `${getBaseUrl(req)}/odata/v2/utility/MeterReadingSet('${item.meterId}')`,
        type: "BTC_UTILITY_ISU_SRV.MeterReading"
      },
      MeterId: item.meterId,
      Customer: item.customer,
      ReadingKWh: item.readingKWh.toString(),
      Tariff: item.tariff,
      Status: item.status
    }
  });
});

// =============================================================
// 3. SCHNITTSTELLE 3: SAP OData v4 Service (Modern RAP / CAP)
// =============================================================

// OData v4 Service Root (öffentlich zur Service Discovery)
app.get('/odata/v4/utility/', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    "@odata.context": "$metadata",
    "value": [
      { "name": "MeterReadings", "kind": "EntitySet", "url": "MeterReadings" }
    ]
  });
});

// OData v4 EntitySet (Geschützt per OAuth2 Bearer Token)
app.get('/odata/v4/utility/MeterReadings', authenticateOAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const data = meterDatabase.map(m => ({
    meterId: m.meterId,
    customer: m.customer,
    readingKWh: m.readingKWh,
    tariff: m.tariff,
    status: m.status
  }));

  res.json({
    "@odata.context": "$metadata#MeterReadings",
    "value": data
  });
});

// =============================================================
// 4. SCHNITTSTELLE 4: Legacy SOAP 1.1 Service (WSDL & XML Envelope)
// =============================================================

// WSDL Download (öffentlich zur Metadaten-Prüfung)
app.get('/soap/utility', (req, res) => {
  if (req.query.wsdl !== undefined) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" 
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" 
                  xmlns:tns="http://btc.de/energy/metering/soap" 
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                  targetNamespace="http://btc.de/energy/metering/soap">
  <wsdl:types>
    <xsd:schema targetNamespace="http://btc.de/energy/metering/soap">
      <xsd:element name="GetMeterReadingRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="MeterId" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="GetMeterReadingResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="MeterId" type="xsd:string"/>
            <xsd:element name="Customer" type="xsd:string"/>
            <xsd:element name="ReadingKWh" type="xsd:decimal"/>
            <xsd:element name="Tariff" type="xsd:string"/>
            <xsd:element name="Status" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </wsdl:types>

  <wsdl:message name="GetMeterReadingSoapIn">
    <wsdl:part name="parameters" element="tns:GetMeterReadingRequest"/>
  </wsdl:message>
  <wsdl:message name="GetMeterReadingSoapOut">
    <wsdl:part name="parameters" element="tns:GetMeterReadingResponse"/>
  </wsdl:message>

  <wsdl:portType name="MeterServiceSoapPort">
    <wsdl:operation name="GetMeterReading">
      <wsdl:input message="tns:GetMeterReadingSoapIn"/>
      <wsdl:output message="tns:GetMeterReadingSoapOut"/>
    </wsdl:operation>
  </wsdl:portType>

  <wsdl:binding name="MeterServiceSoapBinding" type="tns:MeterServiceSoapPort">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="GetMeterReading">
      <soap:operation soapAction="http://btc.de/energy/metering/soap/GetMeterReading" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <wsdl:service name="MeterService">
    <wsdl:port name="MeterServiceSoapPort" binding="tns:MeterServiceSoapBinding">
      <soap:address location="${getBaseUrl(req)}/soap/utility"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`);
  }
  
  res.redirect('/');
});

// SOAP Inbound Processing (Prüft Authorization Header ODER SOAP WS-Security Header)
app.post('/soap/utility', authenticateOAuth, (req, res) => {
  const xmlBody = typeof req.body === 'string' ? req.body : '';
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');

  let requestedMeterId = "DE-OL-MTR-001";
  const match = xmlBody.match(/<MeterId>(.*?)<\/MeterId>/i);
  if (match && match[1]) {
    requestedMeterId = match[1].trim();
  }

  const found = meterDatabase.find(m => m.meterId === requestedMeterId) || meterDatabase[0];

  res.send(`<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:btc="http://btc.de/energy/metering/soap">
   <soapenv:Header/>
   <soapenv:Body>
      <btc:GetMeterReadingResponse>
         <btc:MeterId>${found.meterId}</btc:MeterId>
         <btc:Customer>${found.customer}</btc:Customer>
         <btc:ReadingKWh>${found.readingKWh}</btc:ReadingKWh>
         <btc:Tariff>${found.tariff}</btc:Tariff>
         <btc:Status>${found.status}</btc:Status>
      </btc:GetMeterReadingResponse>
   </soapenv:Body>
</soapenv:Envelope>`);
});

// =============================================================
// 5. DAS 4-SCHNITTSTELLEN-COCKPIT (Interaktives Trainer-Dashboard)
// =============================================================
app.get('/', (req, res) => {
  const hostUrl = getBaseUrl(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BTC Energy API Mock Suite · 4 Protokolle</title>
  <style>
    :root {
      --primary: #0A58CA;       /* Freundliches BTP Königsblau */
      --accent: #0284C7;        /* Frisches Cyan/Himmelblau */
      --accent-soft: #F0F9FF;   /* Sanftes Hellblau */
      --border-color: #E2E8F0;  /* Sauberer dezenter Rand */
      --bg-gray: #F1F5F9;       /* Freundliches, helles Grau */
      --card-bg: #FFFFFF;
      --text-main: #1E293B;     /* Sehr gut lesbares Dunkelgrau */
      --text-muted: #64748B;    /* Sekundärtext */
      --code-bg: #0F172A;       /* Code-Box Kontrast */
      --code-text: #38BDF8;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg-gray);
      color: var(--text-main);
      margin: 0;
      padding: 24px 20px;
    }
    .container {
      max-width: 1480px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid var(--border-color);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0A58CA 0%, #0284C7 100%);
      color: white;
      padding: 24px 30px;
      border-bottom: 1px solid rgba(255,255,255,0.15);
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header h1 { margin: 0 0 4px 0; font-size: 1.6rem; font-weight: 700; color: #FFFFFF; }
    .header p { margin: 0; color: #E0F2FE; font-size: 0.92rem; }

    /* Studio Mode Switcher (Pille oben) */
    .studio-mode-switcher {
      display: flex;
      background: rgba(0, 0, 0, 0.2);
      padding: 4px;
      border-radius: 10px;
      gap: 4px;
      border: 1px solid rgba(255,255,255,0.25);
    }
    .mode-btn {
      padding: 8px 16px;
      border-radius: 7px;
      border: none;
      background: transparent;
      color: #E0F2FE;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .mode-btn:hover { background: rgba(255,255,255,0.15); color: #FFFFFF; }
    .mode-btn.active {
      background: #FFFFFF;
      color: #0A58CA;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    /* Studio Split-Screen Container (70% Stage / 30% Wire-Tap) */
    .studio-layout {
      display: grid;
      grid-template-columns: 7fr 3fr;
      min-height: calc(100vh - 170px);
    }
    @media (max-width: 1100px) {
      .studio-layout { grid-template-columns: 1fr; }
      .studio-sidebar { border-left: none !important; border-top: 2px solid var(--border-color); }
    }

    .studio-stage {
      padding: 24px 28px;
      overflow-y: auto;
      background: #FFFFFF;
    }

    .studio-sidebar {
      padding: 20px 20px;
      background: #F8FAFC;
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* 4 Schnittstellen Kacheln oben */
    .protocol-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .protocol-card {
      background: #F8FAFC;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 14px;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }
    .protocol-card:hover {
      border-color: #93C5FD;
      background: #F0F9FF;
    }
    .protocol-card.selected {
      background: #EFF6FF;
      color: var(--text-main);
      box-shadow: 0 2px 6px rgba(10,88,202,0.08);
      border-color: #0A58CA;
    }
    .protocol-card.selected h3 { color: #0A58CA; }
    .protocol-card h3 { margin: 0 0 4px 0; font-size: 0.9rem; font-weight: 600; color: #1E293B; display: flex; align-items: center; justify-content: space-between; }
    .protocol-card .badge {
      font-size: 0.68rem;
      padding: 2px 6px;
      border-radius: 5px;
      font-weight: 600;
      background: #E2E8F0;
      color: #475569;
    }
    .protocol-card.selected .badge { background: #DBEAFE; color: #1D4ED8; }
    .protocol-card p { margin: 0; font-size: 0.77rem; color: #64748B; line-height: 1.35; }

    /* Freundliche, einheitliche Button-Styles */
    .btn-token {
      background: #0A58CA;
      color: #FFFFFF;
      border: 1px solid #084298;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 1px 2px rgba(10, 88, 202, 0.15);
      transition: all 0.15s ease;
    }
    .btn-token:hover {
      background: #084298;
      border-color: #052c65;
      color: #FFFFFF;
    }
    .btn-token.loading { opacity: 0.6; pointer-events: none; }

    .btn-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #FFFFFF;
      color: #0A58CA;
      border: 1px solid #BFDBFE;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      transition: all 0.15s ease;
    }
    .btn-link:hover {
      background: #EFF6FF;
      border-color: #93C5FD;
      color: #084298;
    }
    .btn-link.primary {
      background: #0284C7;
      color: #FFFFFF;
      border-color: #0284C7;
    }
    .btn-link.primary:hover {
      background: #0369A1;
      border-color: #0369A1;
      color: #FFFFFF;
    }

    /* Tabs Header */
    .tabs-header {
      display: flex;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 16px;
      gap: 4px;
    }
    .tab-btn {
      padding: 7px 12px;
      border: none;
      background: none;
      font-size: 0.82rem;
      font-weight: 600;
      color: #64748B;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      white-space: normal;
      transition: all 0.15s ease;
      border-radius: 4px 4px 0 0;
    }
    .tab-btn:hover { color: var(--text-main); background: #F1F5F9; }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: #F8FAFC;
    }

    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* Code Box */
    .code-box {
      background: var(--code-bg);
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
      border: 1px solid #334155;
    }
    .code-box-header {
      background: #1E293B;
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #94A3B8;
      font-size: 0.77rem;
      font-family: monospace;
      border-bottom: 1px solid #334155;
    }
    .copy-btn {
      background: #334155;
      color: #F1F5F9;
      border: 1px solid #475569;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .copy-btn:hover { background: #475569; }
    .copy-btn.copied { background: #059669; border-color: #059669; color: white; }
    pre {
      margin: 0;
      padding: 12px 14px;
      overflow-x: auto;
      color: #E2E8F0;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.8rem;
      line-height: 1.45;
    }
    
    .note {
      background: #F8FAFC;
      border-left: 4px solid #0A58CA;
      padding: 10px 14px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 16px;
      font-size: 0.84rem;
      color: #1E293B;
      line-height: 1.45;
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
    }
    .note-purple {
      background: #F0F9FF;
      border-left-color: #0284C7;
      color: #0C4A6E;
    }

    /* Endpoint Card */
    .endpoint-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .endpoint-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .endpoint-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: #1E293B;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .method-badge {
      font-size: 0.7rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
    .badge-get { background: #DCFCE7; color: #166534; border: 1px solid #86EFAC; }
    .badge-post { background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
    .url-display-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 8px;
      gap: 8px;
    }
    .url-display-text {
      color: #38BDF8;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.8rem;
      word-break: break-all;
    }
    .url-display-link {
      color: #38BDF8;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.8rem;
      word-break: break-all;
      text-decoration: none;
      flex: 1;
    }
    .url-display-link:hover {
      color: #7DD3FC;
      text-decoration: underline;
    }
    .endpoint-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      font-size: 0.74rem;
      color: #64748B;
    }
    .meta-tag {
      background: #F1F5F9;
      border: 1px solid #E2E8F0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
    .btn-sm-action {
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      color: #334155;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-sm-action:hover { background: #E2E8F0; color: #0F172A; }
    .btn-sm-action.primary { background: #0D9488; color: white; border-color: #0D9488; }
    .btn-sm-action.primary:hover { background: #0F766E; }

    /* Architecture Grid (3 Spalten) */
    .arch-3col-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-top: 14px;
    }
    .arch-card {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      padding: 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .arch-card.highlight {
      border-color: #0284C7;
      box-shadow: 0 4px 14px rgba(2,132,199,0.12);
    }
    .token-status-badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      background: #F1F5F9;
      color: #64748B;
    }
    .token-status-badge.active {
      background: #F0FDF4;
      color: #166534;
      border: 1px solid #BBF7D0;
    }
  </style>
</head>
<body>

  <div class="container">
    <!-- STUDIO HEADER -->
    <div class="header">
      <div class="header-top">
        <div>
          <h1>BTC Energy API Mock &amp; BTP Architecture Studio</h1>
          <p>Interaktives Solution Cockpit für SAP Integration Suite, API Management &amp; Integration Cell</p>
        </div>

        <!-- 2-PERSPEKTIVEN UMSCHALTER -->
        <div class="studio-mode-switcher">
          <button id="btnModeMocks" class="mode-btn active" onclick="switchStudioMode('mocks')">
            <span>1. Mock-Schnittstellen (4 Protokolle)</span>
          </button>
          <button id="btnModeBtp" class="mode-btn" onclick="switchStudioMode('btp')">
            <span>2. BTP-Outbound-Architekturen (3 Wege)</span>
          </button>
        </div>
      </div>
    </div>

    <!-- STUDIO 70/30 SPLIT-SCREEN LAYOUT -->
    <div class="studio-layout">
      
      <!-- ======================================================== -->
      <!-- LINKE BÜHNE (70 %): ARBEITSFLÄCHE NACH MODUS -->
      <!-- ======================================================== -->
      <div class="studio-stage">

        <!-- ========================================== -->
        <!-- VIEW 1: DIE 4 MOCK-SCHNITTSTELLEN -->
        <!-- ========================================== -->
        <div id="studio-view-mocks">
          <!-- 4 Schnittstellen Navigation Kacheln -->
          <div class="protocol-grid">
            <div class="protocol-card selected" onclick="selectProtocol('rest')">
              <h3>1. REST &amp; OAuth 2.0 <span class="badge">OpenAPI 3.0</span></h3>
              <p>Smart Meter Lastgänge mit Client Credentials</p>
            </div>
            <div class="protocol-card" onclick="selectProtocol('odata-v2')">
              <h3>2. SAP OData v2 <span class="badge">EDMX $metadata</span></h3>
              <p>IS-U Zählerstände mit Auto-Proxy</p>
            </div>
            <div class="protocol-card" onclick="selectProtocol('odata-v4')">
              <h3>3. SAP OData v4 <span class="badge">OASIS v4</span></h3>
              <p>CAP / RAP Entitäten &amp; flaches JSON</p>
            </div>
            <div class="protocol-card" onclick="selectProtocol('soap')">
              <h3>4. Legacy SOAP 1.1 <span class="badge">WSDL 1.1</span></h3>
              <p>XML Web Service mit Envelope</p>
            </div>
          </div>

          <!-- MOCK LIVE-TEST COCKPIT -->
          <div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:8px; padding:12px 16px; margin-bottom:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <b style="color:#166534; font-size:0.9rem;">Mock-Backend Direkttest (Schnellprüfung ohne Terminal)</b>
                <div style="color:#475569; font-size:0.78rem;">Generiere ein echtes Provider-Token und teste die 4 Protokolle nativ:</div>
              </div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <select id="mockEndpointSelect" style="padding:6px 10px; border:1px solid #CBD5E1; border-radius:6px; font-size:0.78rem; font-weight:600; color:#1E293B; background:#FFFFFF;" onchange="onMockEndpointChange(this.value)">
                  <option value="rest">1. REST API (/api/v1/smartmeters)</option>
                  <option value="odata-v2">2. SAP OData v2 (/odata/v2/utility/MeterReadingSet)</option>
                  <option value="odata-v4">3. SAP OData v4 (/odata/v4/utility/MeterReadings)</option>
                  <option value="soap">4. Legacy SOAP (/soap/utility - GetMeterReading)</option>
                </select>
                <button id="btnFetchToken" class="btn-token" style="background:#059669;" onclick="fetchLiveToken()">
                  <span>Mock-Token abrufen</span>
                </button>
                <button id="btnInvokeMock" class="btn-token" style="background:#0D9488;" onclick="invokeMockLive()">
                  <span>Ausführen</span>
                </button>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:8px; margin-top:10px; background:white; border:1px solid #BBF7D0; border-radius:6px; padding:5px 10px;">
              <span style="font-size:0.73rem; font-weight:700; color:#059669; white-space:nowrap;">Aktiver Bearer:</span>
              <code id="tokenDisplay" style="flex:1; font-size:0.75rem; color:#334155; word-break:break-all;">&lt;Klicke auf 'Mock-Token abrufen'&gt;</code>
              <span id="tokenBadge" class="token-status-badge">Kein Token</span>
              <button class="copy-btn" onclick="copyLiveToken(this)">Kopieren</button>
            </div>

            <!-- Live Result Box for Mock Call -->
            <div id="mockLiveResultBox" style="display:none; margin-top:10px; background:#0F172A; border:1px solid #334155; border-radius:6px; padding:10px 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span id="mockLiveStatusBadge" style="font-weight:700; font-size:0.78rem; color:#4ADE80;">HTTP 200 OK</span>
                <span id="mockLiveDuration" style="font-size:0.72rem; color:#94A3B8;"></span>
              </div>
              <pre style="margin:0; padding:0; max-height:160px; overflow-y:auto;"><code id="mockLiveCode" style="color:#A7F3D0; font-size:0.73rem;"></code></pre>
              <div id="mockLiveExplanation" style="margin-top:6px; font-size:0.73rem; color:#93C5FD; border-top:1px solid #1E293B; padding-top:4px;"></div>
            </div>
          </div>

          <!-- SCHNITTSTELLE 1: REST -->
          <div id="section-rest" class="protocol-section">
            <div class="note">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div>
                  <b style="font-size:0.9rem; color:#0F172A;">Schnittstelle 1: REST API (Smart Meter Ingestion)</b><br/>
                  OpenAPI 3.0.3 Spezifikation für 15-Minuten Lastgänge (Smart Meter Rollout).
                </div>
                <div style="display:flex; gap:6px;">
                  <a href="/docs" target="_blank" rel="noopener noreferrer" class="btn-link primary">Swagger UI</a>
                  <a href="/openapi.json" target="_blank" rel="noopener noreferrer" class="btn-link">OpenAPI JSON</a>
                </div>
              </div>
            </div>

            <div class="tabs-header">
              <button class="tab-btn active" onclick="switchInnerTab('rest', 'direct')">1. Endpunkte &amp; URLs</button>
              <button class="tab-btn" onclick="switchInnerTab('rest', 'dest')">2. BTP Destination</button>
              <button class="tab-btn" onclick="switchInnerTab('rest', 'arch')">3. Architektur-Blueprint</button>
            </div>

            <div id="rest-direct" class="tab-pane active">
              <div class="endpoint-card">
                <div class="endpoint-header-row">
                  <div class="endpoint-title"><span class="method-badge badge-post">POST</span><span>OAuth Token Service</span></div>
                  <button class="btn-sm-action primary" onclick="fetchLiveToken()">Token abrufen</button>
                </div>
                <div class="url-display-bar">
                  <a href="${hostUrl}/oauth/token" target="_blank" rel="noopener noreferrer" class="url-display-link">${hostUrl}/oauth/token</a>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="${hostUrl}/oauth/token" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none; display:inline-flex; align-items:center;">Öffnen</a>
                    <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/oauth/token', this)">Kopieren</button>
                  </div>
                </div>
                <div class="endpoint-meta">
                  <span>Body:</span>
                  <span class="meta-tag">grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026</span>
                </div>
              </div>

              <div class="endpoint-card">
                <div class="endpoint-header-row">
                  <div class="endpoint-title"><span class="method-badge badge-get">GET</span><span>Zählerdaten abrufen (/api/v1/smartmeters)</span></div>
                </div>
                <div class="url-display-bar">
                  <a href="${hostUrl}/api/v1/smartmeters" target="_blank" rel="noopener noreferrer" class="url-display-link">${hostUrl}/api/v1/smartmeters</a>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="${hostUrl}/api/v1/smartmeters" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none; display:inline-flex; align-items:center;">Öffnen</a>
                    <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/api/v1/smartmeters', this)">Kopieren</button>
                  </div>
                </div>
                <div class="endpoint-meta">
                  <span>Header:</span>
                  <span class="meta-tag">Authorization: Bearer &lt;token&gt;</span>
                  <button class="btn-sm-action" onclick="copyCurrentAuthHeader(this)">Auth-Header kopieren</button>
                </div>
              </div>
            </div>

            <div id="rest-dest" class="tab-pane">
              <div class="code-box">
                <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
                <pre><code>Name = BTC_UTILITY_MOCK_API
Type = HTTP
URL = ${hostUrl}
ProxyType = Internet
Authentication = OAuth2ClientCredentials
tokenServiceURL = ${hostUrl}/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026
IntegrationCell.Include = true</code></pre>
              </div>
            </div>

            <div id="rest-arch" class="tab-pane">
              <div class="note note-purple">
                <b>Architektur-Tipp für REST:</b> Bei Einsatz auf der <b>Integration Cell</b> delegiert das API-Artefakt den Token-Refresh vollautomatisch an die Destination.
              </div>
            </div>
          </div>

          <!-- SCHNITTSTELLE 2: ODATA V2 -->
          <div id="section-odata-v2" class="protocol-section" style="display:none;">
            <div class="note">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div>
                  <b style="font-size:0.9rem; color:#0F172A;">Schnittstelle 2: SAP OData v2 Service (IS-U Utility)</b><br/>
                  Klassischer IS-U Messdaten-Service mit vollständigem EDMX <code>$metadata</code> Katalog.
                </div>
                <div style="display:flex; gap:6px;">
                  <a href="/odata/v2/utility/$metadata" target="_blank" rel="noopener noreferrer" class="btn-link primary">EDMX $metadata</a>
                </div>
              </div>
            </div>

            <div class="tabs-header">
              <button class="tab-btn active" onclick="switchInnerTab('odata-v2', 'direct')">1. Endpunkte &amp; URLs</button>
              <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'dest')">2. BTP Destination</button>
            </div>

            <div id="odata-v2-direct" class="tab-pane active">
              <div class="endpoint-card">
                <div class="endpoint-header-row"><div class="endpoint-title"><span class="method-badge badge-get">GET</span><span>$metadata EDMX</span></div></div>
                <div class="url-display-bar">
                  <a href="${hostUrl}/odata/v2/utility/$metadata" target="_blank" rel="noopener noreferrer" class="url-display-link">${hostUrl}/odata/v2/utility/$metadata</a>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="${hostUrl}/odata/v2/utility/$metadata" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none; display:inline-flex; align-items:center;">Öffnen</a>
                    <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v2/utility/$metadata', this)">Kopieren</button>
                  </div>
                </div>
              </div>
              <div class="endpoint-card">
                <div class="endpoint-header-row"><div class="endpoint-title"><span class="method-badge badge-get">GET</span><span>EntitySet: MeterReadingSet</span></div></div>
                <div class="url-display-bar">
                  <a href="${hostUrl}/odata/v2/utility/MeterReadingSet" target="_blank" rel="noopener noreferrer" class="url-display-link">${hostUrl}/odata/v2/utility/MeterReadingSet</a>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="${hostUrl}/odata/v2/utility/MeterReadingSet" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none; display:inline-flex; align-items:center;">Öffnen</a>
                    <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v2/utility/MeterReadingSet', this)">Kopieren</button>
                  </div>
                </div>
              </div>
            </div>

            <div id="odata-v2-dest" class="tab-pane">
              <div class="code-box">
                <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
                <pre><code>Name = BTC_UTILITY_MOCK_API
Type = HTTP
URL = ${hostUrl}
Authentication = OAuth2ClientCredentials
tokenServiceURL = ${hostUrl}/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026
IntegrationCell.Include = true</code></pre>
              </div>
            </div>
          </div>

          <!-- SCHNITTSTELLE 3: ODATA V4 -->
          <div id="section-odata-v4" class="protocol-section" style="display:none;">
            <div class="note">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div>
                  <b style="font-size:0.9rem; color:#0F172A;">Schnittstelle 3: SAP OData v4 Service (Modern RAP / CAP)</b><br/>
                  Moderne OASIS OData v4 Entitäten mit flacher, KI-effizienter JSON-Struktur.
                </div>
                <div style="display:flex; gap:6px;">
                  <a href="/odata/v4/utility/$metadata" target="_blank" rel="noopener noreferrer" class="btn-link primary">OData v4 $metadata</a>
                </div>
              </div>
            </div>

            <div class="tabs-header">
              <button class="tab-btn active" onclick="switchInnerTab('odata-v4', 'direct')">1. Endpunkte &amp; URLs</button>
              <button class="tab-btn" onclick="switchInnerTab('odata-v4', 'dest')">2. BTP Destination</button>
            </div>

            <div id="odata-v4-direct" class="tab-pane active">
              <div class="endpoint-card">
                <div class="endpoint-header-row"><div class="endpoint-title"><span class="method-badge badge-get">GET</span><span>EntitySet: MeterReadings</span></div></div>
                <div class="url-display-bar">
                  <a href="${hostUrl}/odata/v4/utility/MeterReadings" target="_blank" rel="noopener noreferrer" class="url-display-link">${hostUrl}/odata/v4/utility/MeterReadings</a>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="${hostUrl}/odata/v4/utility/MeterReadings" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none; display:inline-flex; align-items:center;">Öffnen</a>
                    <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v4/utility/MeterReadings', this)">Kopieren</button>
                  </div>
                </div>
              </div>
            </div>

            <div id="odata-v4-dest" class="tab-pane">
              <div class="code-box">
                <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
                <pre><code>Name = BTC_UTILITY_MOCK_API
Type = HTTP
URL = ${hostUrl}
Authentication = OAuth2ClientCredentials
tokenServiceURL = ${hostUrl}/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026
IntegrationCell.Include = true</code></pre>
              </div>
            </div>
          </div>

          <!-- SCHNITTSTELLE 4: SOAP -->
          <div id="section-soap" class="protocol-section" style="display:none;">
            <div class="note">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div>
                  <b style="font-size:0.9rem; color:#0F172A;">Schnittstelle 4: Legacy SOAP 1.1 Service</b><br/>
                  Klassischer XML Web Service mit SOAP-Envelope und WSDL 1.1 Spezifikation.
                </div>
                <div style="display:flex; gap:6px;">
                  <a href="/soap/utility?wsdl" target="_blank" rel="noopener noreferrer" class="btn-link primary">WSDL herunterladen</a>
                </div>
              </div>
            </div>

            <div class="tabs-header">
              <button class="tab-btn active" onclick="switchInnerTab('soap', 'direct')">1. Endpunkte &amp; URLs</button>
              <button class="tab-btn" onclick="switchInnerTab('soap', 'dest')">2. BTP Destination</button>
            </div>

            <div id="soap-direct" class="tab-pane active">
              <div class="endpoint-card">
                <div class="endpoint-header-row"><div class="endpoint-title"><span class="method-badge badge-post">POST</span><span>SOAP Action: GetMeterReading</span></div></div>
                <div class="url-display-bar">
                  <a href="${hostUrl}/soap/utility" target="_blank" rel="noopener noreferrer" class="url-display-link">${hostUrl}/soap/utility</a>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="${hostUrl}/soap/utility" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none; display:inline-flex; align-items:center;">Öffnen</a>
                    <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/soap/utility', this)">Kopieren</button>
                  </div>
                </div>
                <div class="endpoint-meta">
                  <span>SOAPAction:</span>
                  <span class="meta-tag">http://btc.de/energy/metering/soap/GetMeterReading</span>
                </div>
              </div>
            </div>

            <div id="soap-dest" class="tab-pane">
              <div class="code-box">
                <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
                <pre><code>Name = BTC_UTILITY_MOCK_API
Type = HTTP
URL = ${hostUrl}
Authentication = OAuth2ClientCredentials
tokenServiceURL = ${hostUrl}/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026
IntegrationCell.Include = true</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- VIEW 2: DIE 3 BTP-OUTBOUND-ARCHITEKTUREN -->
        <!-- ========================================== -->
        <div id="studio-view-btp" style="display:none;">
          <div class="note note-purple" style="margin-bottom:18px;">
            <b style="font-size:0.95rem;">Die 3 SAP BTP Architekturpfade für Outbound-OAuth Backend-Schutz</b><br/>
            Wähle einen Pfad, beziehe das Gateway- bzw. Runtime-Token und löse den autorisierten Backend-Durchstich aus. 
            Im rechten Wire-Tap siehst du synchron in Echtzeit, mit welcher Identität der Request ankommt.
          </div>

          <div class="arch-3col-grid">
            
            <!-- WEG 1: KLASSISCH APIM NATIV -->
            <div class="arch-card">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                  <span style="font-size:0.68rem; font-weight:700; color:#475569; background:#F1F5F9; padding:2px 6px; border-radius:4px;">
                    OPTION 1 · GATEWAY-NATIV
                  </span>
                  <span id="btpApimTokenBadge" class="token-status-badge">Kein Token</span>
                </div>
                <h3 style="margin:0 0 6px 0; font-size:1rem; color:#1E293B;">Weg 1: Klassisch APIM Nativ</h3>
                <p style="font-size:0.77rem; color:#64748B; margin:0 0 10px 0; line-height:1.4;">
                  Reine APIM-Laufzeit. Token-Caching im RAM via KVM &amp; Hilfsproxy (<code>/get/oauth</code>). Keine CPI-Abhängigkeit.
                </p>

                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:6px 8px; font-size:0.72rem; font-family:monospace; margin-bottom:10px; color:#334155;">
                  <div><b>Tresor:</b> APIM Encrypted KVM</div>
                  <div><b>Broker:</b> Hilfsproxy /get/oauth</div>
                  <div><b>Aufwand:</b> 12–16 Std. (XML-Policies)</div>
                </div>

                <!-- Ziel-Endpoint -->
                <div style="margin-bottom:8px;">
                  <div style="font-size:0.72rem; font-weight:600; color:#475569; margin-bottom:2px;">BTP Gateway Ziel:</div>
                  <div class="url-display-bar">
                    <a href="${BTP_CREDENTIALS.apim_classic.endpoint}" target="_blank" rel="noopener noreferrer" class="url-display-link">${BTP_CREDENTIALS.apim_classic.endpoint}</a>
                    <button class="copy-btn" onclick="copyToClipboard('${BTP_CREDENTIALS.apim_classic.endpoint}', this)">Kopieren</button>
                  </div>
                </div>

                <!-- Token Display -->
                <div style="margin-bottom:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                    <span style="font-size:0.72rem; font-weight:600; color:#475569;">Bearer Token:</span>
                    <button class="copy-btn" onclick="copyBtpToken('apim_classic', this)">Kopieren</button>
                  </div>
                  <code id="btpApimTokenDisplay" style="display:block; font-size:0.7rem; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:4px; padding:4px 8px; color:#1E293B; word-break:break-all; max-height:40px; overflow-y:auto;">&lt;Klicke auf 'Token abrufen'&gt;</code>
                </div>
              </div>

              <div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button id="btnFetchApimToken" class="btn-token" style="background:#475569;" onclick="fetchBtpToken('apim_classic')">
                    <span>1. Token abrufen</span>
                  </button>
                  <button id="btnInvokeApim" class="btn-token" style="background:#334155;" onclick="invokeBtp('apim_classic')">
                    <span>2. Testen</span>
                  </button>
                </div>

                <div id="btpApimResultBox" style="display:none; margin-top:10px; background:#0F172A; border:1px solid #334155; border-radius:6px; padding:8px 10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span id="btpApimStatusBadge" style="font-weight:700; font-size:0.76rem; color:#4ADE80;">HTTP 200 OK</span>
                    <span id="btpApimDuration" style="font-size:0.68rem; color:#94A3B8;"></span>
                  </div>
                  <pre style="margin:0; padding:0; max-height:110px; overflow-y:auto;"><code id="btpApimCode" style="color:#A7F3D0; font-size:0.7rem;"></code></pre>
                  <div id="btpApimExplanation" style="margin-top:6px; font-size:0.72rem; color:#93C5FD; border-top:1px solid #1E293B; padding-top:4px;"></div>
                </div>
              </div>
            </div>

            <!-- WEG 2: HYBRID APIM + IFLOW -->
            <div class="arch-card">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                  <span style="font-size:0.68rem; font-weight:700; color:#0369A1; background:#E0F2FE; padding:2px 6px; border-radius:4px;">
                    OPTION 2 · HYBRID SUITE
                  </span>
                  <span id="btpHybridTokenBadge" class="token-status-badge">Kein Token</span>
                </div>
                <h3 style="margin:0 0 6px 0; font-size:1rem; color:#0369A1;">Weg 2: Hybrid APIM + iFlow</h3>
                <p style="font-size:0.77rem; color:#64748B; margin:0 0 10px 0; line-height:1.4;">
                  Funktionstrennung: Governance im APIM, Konnektivität &amp; BTP Security Material im Shared CPI-iFlow.
                </p>

                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:6px 8px; font-size:0.72rem; font-family:monospace; margin-bottom:10px; color:#334155;">
                  <div><b>Tresor:</b> BTP Keystore (SecMat)</div>
                  <div><b>Broker:</b> Shared iFlow /cpi/oauth</div>
                  <div><b>Aufwand:</b> 8–12 Std. (Groovy &amp; Flow)</div>
                </div>

                <!-- Ziel-Endpoint -->
                <div style="margin-bottom:8px;">
                  <div style="font-size:0.72rem; font-weight:600; color:#475569; margin-bottom:2px;">BTP CPI Ziel:</div>
                  <div class="url-display-bar">
                    <a href="${BTP_CREDENTIALS.apim_hybrid.endpoint}" target="_blank" rel="noopener noreferrer" class="url-display-link">${BTP_CREDENTIALS.apim_hybrid.endpoint}</a>
                    <button class="copy-btn" onclick="copyToClipboard('${BTP_CREDENTIALS.apim_hybrid.endpoint}', this)">Kopieren</button>
                  </div>
                </div>

                <!-- Token Display -->
                <div style="margin-bottom:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                    <span style="font-size:0.72rem; font-weight:600; color:#475569;">Bearer Token:</span>
                    <button class="copy-btn" onclick="copyBtpToken('apim_hybrid', this)">Kopieren</button>
                  </div>
                  <code id="btpHybridTokenDisplay" style="display:block; font-size:0.7rem; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:4px; padding:4px 8px; color:#1E293B; word-break:break-all; max-height:40px; overflow-y:auto;">&lt;Klicke auf 'Token abrufen'&gt;</code>
                </div>
              </div>

              <div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button id="btnFetchHybridToken" class="btn-token" style="background:#0284C7;" onclick="fetchBtpToken('apim_hybrid')">
                    <span>1. Token abrufen</span>
                  </button>
                  <button id="btnInvokeHybrid" class="btn-token" style="background:#0369A1;" onclick="invokeBtp('apim_hybrid')">
                    <span>2. Testen</span>
                  </button>
                </div>

                <div id="btpHybridResultBox" style="display:none; margin-top:10px; background:#0F172A; border:1px solid #334155; border-radius:6px; padding:8px 10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span id="btpHybridStatusBadge" style="font-weight:700; font-size:0.76rem; color:#4ADE80;">HTTP 200 OK</span>
                    <span id="btpHybridDuration" style="font-size:0.68rem; color:#94A3B8;"></span>
                  </div>
                  <pre style="margin:0; padding:0; max-height:110px; overflow-y:auto;"><code id="btpHybridCode" style="color:#A7F3D0; font-size:0.7rem;"></code></pre>
                  <div id="btpHybridExplanation" style="margin-top:6px; font-size:0.72rem; color:#93C5FD; border-top:1px solid #1E293B; padding-top:4px;"></div>
                </div>
              </div>
            </div>

            <!-- WEG 3: INTEGRATION CELL (NORTH STAR) -->
            <div class="arch-card highlight">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                  <span style="font-size:0.68rem; font-weight:700; color:#047857; background:#D1FAE5; padding:2px 6px; border-radius:4px;">
                    NORTH STAR · ZERO CODE
                  </span>
                  <span id="btpDevTokenBadge" class="token-status-badge">Kein Token</span>
                </div>
                <h3 style="margin:0 0 6px 0; font-size:1rem; color:#0A58CA;">Weg 3: Integration Cell</h3>
                <p style="font-size:0.77rem; color:#64748B; margin:0 0 10px 0; line-height:1.4;">
                  Modernes API-Artefakt auf K8s Edge Gateway. Destination delegiert OAuth vollautomatisch. Developer Hub Key Inbound.
                </p>

                <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; padding:6px 8px; font-size:0.72rem; font-family:monospace; margin-bottom:10px; color:#166534;">
                  <div><b>Tresor:</b> BTP Destination Service</div>
                  <div><b>Gateway:</b> Istio Envoy Pod (/demo)</div>
                  <div><b>Aufwand:</b> 3–5 Std. (Zero Code!)</div>
                </div>

                <!-- Ziel-Endpoint -->
                <div style="margin-bottom:8px;">
                  <div style="font-size:0.72rem; font-weight:600; color:#166534; margin-bottom:2px;">Integration Cell Live Endpoint:</div>
                  <div class="url-display-bar">
                    <a href="${BTP_CREDENTIALS.devhub.endpoint}" target="_blank" rel="noopener noreferrer" class="url-display-link">${BTP_CREDENTIALS.devhub.endpoint}</a>
                    <button class="copy-btn" onclick="copyToClipboard('${BTP_CREDENTIALS.devhub.endpoint}', this)">Kopieren</button>
                  </div>
                </div>

                <!-- Token Display -->
                <div style="margin-bottom:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                    <span style="font-size:0.72rem; font-weight:600; color:#475569;">Developer Key Token:</span>
                    <button class="copy-btn" onclick="copyBtpToken('devhub', this)">Kopieren</button>
                  </div>
                  <code id="btpDevTokenDisplay" style="display:block; font-size:0.7rem; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:4px; padding:4px 8px; color:#1E293B; word-break:break-all; max-height:40px; overflow-y:auto;">&lt;Klicke auf 'Token abrufen'&gt;</code>
                </div>
              </div>

              <div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button id="btnFetchDevToken" class="btn-token" style="background:#0A58CA;" onclick="fetchBtpToken('devhub')">
                    <span>1. Token abrufen</span>
                  </button>
                  <button id="btnInvokeDev" class="btn-token" style="background:#0284C7;" onclick="invokeBtp('devhub')">
                    <span>2. Testen (/demo)</span>
                  </button>
                  <button id="btnInvokeSvc" class="btn-token" style="background:#64748B;" onclick="invokeBtp('servicekey')" title="Testet mit generischem Service Key ohne Produkt-Subskription">
                    <span>Service Key Test</span>
                  </button>
                </div>

                <div id="btpDevResultBox" style="display:none; margin-top:10px; background:#0F172A; border:1px solid #334155; border-radius:6px; padding:8px 10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span id="btpDevStatusBadge" style="font-weight:700; font-size:0.76rem; color:#4ADE80;">HTTP 200 OK</span>
                    <span id="btpDevDuration" style="font-size:0.68rem; color:#94A3B8;"></span>
                  </div>
                  <pre style="margin:0; padding:0; max-height:110px; overflow-y:auto;"><code id="btpDevCode" style="color:#A7F3D0; font-size:0.7rem;"></code></pre>
                  <div id="btpDevExplanation" style="margin-top:6px; font-size:0.72rem; color:#93C5FD; border-top:1px solid #1E293B; padding-top:4px;"></div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      <!-- ======================================================== -->
      <!-- RECHTE SEITENLEISTE (30 % PERSISTENT): WIRE-TAP TELEMETRY -->
      <!-- ======================================================== -->
      <div class="studio-sidebar">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
          <div>
            <h3 style="margin:0; font-size:0.95rem; color:#0A3D62; display:flex; align-items:center; gap:6px;">
              <span>Live Wire-Tap Telemetrie</span>
            </h3>
            <div style="font-size:0.72rem; color:#64748B; margin-top:2px;">
              KRITIS Access Log (BSI C5 &amp; NIS-2)
            </div>
          </div>
          <button class="btn-sm-action" onclick="refreshAuditLogs()" title="Aktualisieren">
            <span>Aktualisieren</span>
          </button>
        </div>

        <div style="font-size:0.74rem; color:#475569; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:6px; padding:8px 10px; line-height:1.4;">
          <b>Synchrones Monitoring:</b> Jeder Klick links schlägt synchron hier rechts auf. Beobachte Client-ID, Token-Preview und HTTP-Status in Echtzeit.
        </div>

        <!-- Wire-Tap Log Container -->
        <div id="auditLogFeed" style="display:flex; flex-direction:column; gap:8px; overflow-y:auto; max-height:calc(100vh - 310px); padding-right:4px;">
          <div style="text-align:center; padding:20px 10px; color:#64748B; font-size:0.76rem;">
            Warte auf eingehende Aufrufe... Klicke links auf einen Testbutton.
          </div>
        </div>

        <div style="margin-top:auto; font-size:0.7rem; color:#64748B; border-top:1px solid var(--border-color); padding-top:8px; display:flex; justify-content:space-between;">
          <span id="auditTotalText">0 Events</span>
          <span>Auto-Polling: 5s</span>
        </div>
      </div>

    </div>
  </div>

  <script>
    let currentLiveToken = "";
    const btpTokens = { devhub: "", servicekey: "", apim_classic: "", apim_hybrid: "" };
    const btpTimers = { devhub: null, servicekey: null, apim_classic: null, apim_hybrid: null };

    // Umschalten zwischen Mock-Schnittstellen und den 3 BTP-Wegen
    function switchStudioMode(mode) {
      document.getElementById('btnModeMocks').classList.toggle('active', mode === 'mocks');
      document.getElementById('btnModeBtp').classList.toggle('active', mode === 'btp');
      document.getElementById('studio-view-mocks').style.display = mode === 'mocks' ? 'block' : 'none';
      document.getElementById('studio-view-btp').style.display = mode === 'btp' ? 'block' : 'none';
    }

    async function fetchBtpToken(type) {
      const btnMap = {
        'devhub': 'btnFetchDevToken',
        'servicekey': 'btnFetchSvcToken',
        'apim_classic': 'btnFetchApimToken',
        'apim_hybrid': 'btnFetchHybridToken'
      };
      const badgeMap = {
        'devhub': 'btpDevTokenBadge',
        'servicekey': 'btpDevTokenBadge',
        'apim_classic': 'btpApimTokenBadge',
        'apim_hybrid': 'btpHybridTokenBadge'
      };
      const displayMap = {
        'devhub': 'btpDevTokenDisplay',
        'servicekey': 'btpDevTokenDisplay',
        'apim_classic': 'btpApimTokenDisplay',
        'apim_hybrid': 'btpHybridTokenDisplay'
      };

      const btn = document.getElementById(btnMap[type]);
      const badge = document.getElementById(badgeMap[type]);
      const display = document.getElementById(displayMap[type]);

      if (btn) {
        btn.classList.add('loading');
        btn.innerHTML = '<span>XSUAA...</span>';
      }

      try {
        const res = await fetch('/api/btp/token?keyType=' + type);
        const data = await res.json();
        if (data.access_token) {
          btpTokens[type] = data.access_token;
          if (display) display.innerText = data.access_token;

          let secondsLeft = data.expires_in || 3599;
          if (badge) {
            badge.classList.add('active');
            badge.innerText = 'Gültig (' + secondsLeft + 's)';
          }
          if (btpTimers[type]) clearInterval(btpTimers[type]);
          btpTimers[type] = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
              clearInterval(btpTimers[type]);
              if (badge) badge.innerText = 'Abgelaufen';
            } else if (badge) {
              badge.innerText = 'Gültig (' + secondsLeft + 's)';
            }
          }, 1000);

          if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = '<span>Token aktiv</span>';
            setTimeout(() => { btn.innerHTML = '<span>Token neu</span>'; }, 2000);
          }
        } else {
          if (display) display.innerText = 'Fehler: ' + JSON.stringify(data);
          if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = '<span>Token abrufen</span>';
          }
        }
      } catch (err) {
        if (display) display.innerText = 'Netzwerkfehler: ' + err.message;
        if (btn) {
          btn.classList.remove('loading');
          btn.innerHTML = '<span>Token abrufen</span>';
        }
      }
    }

    async function invokeBtp(type) {
      const boxMap = {
        'devhub': 'btpDevResultBox',
        'servicekey': 'btpDevResultBox',
        'apim_classic': 'btpApimResultBox',
        'apim_hybrid': 'btpHybridResultBox'
      };
      const badgeMap = {
        'devhub': 'btpDevStatusBadge',
        'servicekey': 'btpDevStatusBadge',
        'apim_classic': 'btpApimStatusBadge',
        'apim_hybrid': 'btpHybridStatusBadge'
      };
      const durMap = {
        'devhub': 'btpDevDuration',
        'servicekey': 'btpDevDuration',
        'apim_classic': 'btpApimDuration',
        'apim_hybrid': 'btpHybridDuration'
      };
      const codeMap = {
        'devhub': 'btpDevCode',
        'servicekey': 'btpDevCode',
        'apim_classic': 'btpApimCode',
        'apim_hybrid': 'btpHybridCode'
      };
      const expMap = {
        'devhub': 'btpDevExplanation',
        'servicekey': 'btpDevExplanation',
        'apim_classic': 'btpApimExplanation',
        'apim_hybrid': 'btpHybridExplanation'
      };

      const resultBox = document.getElementById(boxMap[type]);
      const statusBadge = document.getElementById(badgeMap[type]);
      const durationSpan = document.getElementById(durMap[type]);
      const codeEl = document.getElementById(codeMap[type]);
      const explanation = document.getElementById(expMap[type]);

      if (resultBox) resultBox.style.display = 'block';
      if (statusBadge) {
        statusBadge.style.color = '#38BDF8';
        statusBadge.innerText = 'Sende Request an BTP Suite...';
      }

      try {
        const res = await fetch('/api/btp/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyType: type, token: btpTokens[type] || undefined })
        });
        const data = await res.json();

        if (data.status === 200) {
          if (statusBadge) {
            statusBadge.style.color = '#4ADE80';
            statusBadge.innerText = 'HTTP ' + data.status + ' OK · ' + (data.server || 'btp-runtime');
          }
          if (durationSpan) durationSpan.innerText = 'Dauer: ' + data.durationMs + ' ms';
          if (codeEl) codeEl.innerText = JSON.stringify(data.data, null, 2);
          if (explanation) {
            if (type === 'devhub') {
              explanation.innerHTML = '<b>Weg 3 Erfolg (Integration Cell):</b> Token autorisiert, Developer Key gebunden! Der Aufruf schlägt im rechten Wire-Tap auf.';
            } else if (type === 'apim_classic') {
              explanation.innerHTML = '<b>Weg 1 Erfolg (Klassisch APIM):</b> KVM-Credentials geladen, Token aus RAM gecacht und Backend per Bearer erreicht.';
            } else if (type === 'apim_hybrid') {
              explanation.innerHTML = '<b>Weg 2 Erfolg (Hybrid APIM + CPI):</b> Token über Shared iFlow aus BTP Keystore bezogen und autorisiert weitergereicht.';
            }
          }
          addClientAuditLog({
            status: 200,
            client: type === 'devhub' ? 'sb-dh-3b72cd96 (Developer Hub)' : (type === 'apim_classic' ? 'sb-apim-classic-kvm' : 'sb-hybrid-cpi-flow'),
            authMethod: type === 'devhub' ? 'Weg 3: Integration Cell Edge' : (type === 'apim_classic' ? 'Weg 1: Klassisch APIM KVM' : 'Weg 2: Hybrid APIM+CPI'),
            tokenPreview: (btpTokens[type] || 'ey_bearer...').substring(0, 20) + '...',
            path: type === 'devhub' ? '/demo' : '/api/v1/smartmeters',
            method: 'GET'
          });
        } else if (data.status === 403) {
          if (statusBadge) {
            statusBadge.style.color = '#F87171';
            statusBadge.innerText = 'HTTP ' + data.status + ' Forbidden';
          }
          if (durationSpan) durationSpan.innerText = 'Dauer: ' + data.durationMs + ' ms';
          if (codeEl) codeEl.innerText = JSON.stringify(data.data, null, 2);
          if (explanation) explanation.innerHTML = '<b>Didaktischer Aha-Effekt:</b> Ohne Developer Hub Produkt-Subskription verweigert die Integration Cell den Service Key mit 403!';
          addClientAuditLog({
            status: 403,
            client: 'sb-f581317a (Service Key ohne Subskription)',
            authMethod: 'Integration Cell (Forbidden)',
            tokenPreview: (btpTokens[type] || 'ey_servicekey...').substring(0, 20) + '...',
            path: '/demo',
            method: 'GET'
          });
        } else {
          if (statusBadge) {
            statusBadge.style.color = '#F87171';
            statusBadge.innerText = 'HTTP ' + (data.status || '500');
          }
          if (codeEl) codeEl.innerText = JSON.stringify(data.data || data, null, 2);
        }

        setTimeout(refreshAuditLogs, 300);
      } catch (err) {
        if (statusBadge) {
          statusBadge.style.color = '#F87171';
          statusBadge.innerText = 'Fehler: ' + err.message;
        }
        if (codeEl) codeEl.innerText = err.message;
      }
    }

    const MOCK_PROTOCOLS = {
      'rest': {
        name: 'REST API (OpenAPI 3.0)',
        method: 'GET',
        url: '/api/v1/smartmeters',
        headers: { 'Accept': 'application/json' },
        explanation: '<b>REST-Aufruf erfolgreich:</b> Das Mock-Backend hat das Bearer-Token autorisiert und liefert die 4 Zähler-Datensätze als JSON nach OpenAPI 3.0 Spezifikation.'
      },
      'odata-v2': {
        name: 'SAP OData v2 Service',
        method: 'GET',
        url: '/odata/v2/utility/MeterReadingSet',
        headers: { 'Accept': 'application/json' },
        explanation: '<b>OData v2 Aufruf erfolgreich:</b> Der native IS-U Utility Service antwortet im standardisierten OData v2 JSON-Format (EntitySet <code>MeterReadingSet</code>).'
      },
      'odata-v4': {
        name: 'SAP OData v4 Service',
        method: 'GET',
        url: '/odata/v4/utility/MeterReadings',
        headers: { 'Accept': 'application/json' },
        explanation: '<b>OData v4 Aufruf erfolgreich:</b> Moderner RAP/CAP Service mit flachem OASIS OData v4 JSON (inkl. <code>@odata.context</code> und <code>value</code>).'
      },
      'soap': {
        name: 'Legacy SOAP 1.1 Web Service',
        method: 'POST',
        url: '/soap/utility',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://btc.de/energy/metering/soap/GetMeterReading'
        },
        body: '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:btc="http://btc.de/energy/metering/soap">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <btc:GetMeterReadingRequest>\n         <btc:MeterId>DE-OL-MTR-002</btc:MeterId>\n      </btc:GetMeterReadingRequest>\n   </soapenv:Body>\n</soapenv:Envelope>',
        explanation: '<b>SOAP 1.1 Aufruf erfolgreich:</b> Der XML-Webservice hat den SOAP-Envelope und die SOAPAction verarbeitet und liefert valides SOAP-Response XML zurück.'
      }
    };

    function onMockEndpointChange(val) {
      selectProtocol(val);
    }

    async function invokeMockLive(proto) {
      const selected = proto || document.getElementById('mockEndpointSelect')?.value || 'rest';
      const config = MOCK_PROTOCOLS[selected] || MOCK_PROTOCOLS.rest;

      const selectEl = document.getElementById('mockEndpointSelect');
      if (selectEl) selectEl.value = selected;

      const resultBox = document.getElementById('mockLiveResultBox');
      const statusBadge = document.getElementById('mockLiveStatusBadge');
      const endpointSpan = document.getElementById('mockLiveEndpoint');
      const durationSpan = document.getElementById('mockLiveDuration');
      const codeEl = document.getElementById('mockLiveCode');
      const explanation = document.getElementById('mockLiveExplanation');
      const btn = document.getElementById('btnInvokeMock');

      if (resultBox) resultBox.style.display = 'block';
      if (statusBadge) {
        statusBadge.style.color = '#38BDF8';
        statusBadge.innerText = 'Sende Request...';
      }
      if (endpointSpan) endpointSpan.innerText = config.method + ' ' + config.url;
      if (durationSpan) durationSpan.innerText = '';
      if (codeEl) codeEl.innerText = 'Rufe Mock-Backend direkt im Browser auf...';
      if (explanation) explanation.innerText = '';

      if (btn) btn.classList.add('loading');

      try {
        if (!currentLiveToken) {
          if (statusBadge) statusBadge.innerText = 'Hole zuerst Provider-Token...';
          await fetchLiveToken();
        }

        const startTime = Date.now();
        const headers = { ...config.headers };
        if (currentLiveToken) {
          headers['Authorization'] = 'Bearer ' + currentLiveToken;
        }

        const res = await fetch(config.url, {
          method: config.method,
          headers: headers,
          body: config.body || undefined
        });

        const durationMs = Date.now() - startTime;
        if (btn) btn.classList.remove('loading');

        const contentType = res.headers.get('content-type') || '';
        let displayData;
        if (contentType.includes('application/json')) {
          const json = await res.json();
          displayData = JSON.stringify(json, null, 2);
        } else {
          displayData = await res.text();
        }

        if (res.ok) {
          if (statusBadge) {
            statusBadge.style.color = '#4ADE80';
            statusBadge.innerText = 'HTTP ' + res.status + ' ' + (res.statusText || 'OK');
          }
          if (durationSpan) durationSpan.innerText = 'Dauer: ' + durationMs + ' ms';
          if (codeEl) codeEl.innerText = displayData;
          if (explanation) explanation.innerHTML = config.explanation;
          addClientAuditLog({
            status: res.status,
            client: 'Mock Direct Client (Browser)',
            authMethod: 'Bearer (Direct Mock Auth)',
            tokenPreview: currentLiveToken ? (currentLiveToken.substring(0, 20) + '...') : 'kein Token',
            path: config.url,
            method: config.method
          });
        } else {
          if (statusBadge) {
            statusBadge.style.color = '#F87171';
            statusBadge.innerText = 'HTTP ' + res.status + ' ' + (res.statusText || 'Error');
          }
          if (durationSpan) durationSpan.innerText = 'Dauer: ' + durationMs + ' ms';
          if (codeEl) codeEl.innerText = displayData;
          if (explanation) explanation.innerHTML = 'Das Mock-Backend meldete einen Fehler: Bitte überprüfe das Bearer-Token.';
          addClientAuditLog({
            status: res.status,
            client: 'Mock Direct Client (Browser)',
            authMethod: 'Direct Error',
            tokenPreview: currentLiveToken ? (currentLiveToken.substring(0, 20) + '...') : 'kein Token',
            path: config.url,
            method: config.method
          });
        }
        setTimeout(refreshAuditLogs, 300);
      } catch (err) {
        if (btn) btn.classList.remove('loading');
        if (statusBadge) {
          statusBadge.style.color = '#F87171';
          statusBadge.innerText = 'Verbindungsfehler: ' + err.message;
        }
        if (codeEl) codeEl.innerText = err.message;
        if (explanation) explanation.innerText = '';
      }
    }

    async function fetchLiveToken() {
      const liveBtns = [document.getElementById('btnFetchToken')].filter(Boolean);
      const badge = document.getElementById('tokenBadge');
      const display = document.getElementById('tokenDisplay');
      
      liveBtns.forEach(b => {
        b.classList.add('loading');
        b.innerHTML = '<span>Token wird geholt...</span>';
      });

      try {
        const res = await fetch('/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026'
        });
        const data = await res.json();
        
        if (data.access_token) {
          currentLiveToken = data.access_token;
          if (badge) {
            badge.classList.add('active');
            badge.innerText = 'Gültig (' + data.expires_in + 's)';
          }
          if (display) {
            display.innerText = currentLiveToken;
          }
          liveBtns.forEach(b => {
            b.classList.remove('loading');
            b.innerHTML = '<span>Token aktiv</span>';
            setTimeout(() => { b.innerHTML = '<span>Token neu</span>'; }, 2000);
          });
        } else {
          if (display) display.innerText = "Fehler: " + JSON.stringify(data);
          liveBtns.forEach(b => {
            b.classList.remove('loading');
            b.innerHTML = '<span>Token abrufen</span>';
          });
        }
      } catch (e) {
        if (display) display.innerText = "Netzwerkfehler: " + e.message;
        liveBtns.forEach(b => {
          b.classList.remove('loading');
          b.innerHTML = '<span>Token abrufen</span>';
        });
      }
    }

    function copyLiveToken(btn) {
      copyToClipboard(currentLiveToken, btn);
    }

    function selectProtocol(protoId) {
      document.querySelectorAll('.protocol-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.protocol-section').forEach(s => s.style.display = 'none');
      
      const card = Array.from(document.querySelectorAll('.protocol-card')).find(c => c.getAttribute('onclick').includes(protoId));
      if (card) card.classList.add('selected');

      const sec = document.getElementById('section-' + protoId);
      if (sec) sec.style.display = 'block';

      const selectEl = document.getElementById('mockEndpointSelect');
      if (selectEl && selectEl.value !== protoId) {
        selectEl.value = protoId;
      }
    }

    function switchInnerTab(section, tabId) {
      const sec = document.getElementById('section-' + section);
      if (!sec) return;
      sec.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      sec.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      
      const activeBtn = Array.from(sec.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      if (activeBtn) activeBtn.classList.add('active');
      
      const pane = document.getElementById(section + '-' + tabId);
      if (pane) pane.classList.add('active');
    }

    function copyCode(btn) {
      const pre = btn.closest('.code-box').querySelector('pre code');
      if (!pre) return;
      copyToClipboard(pre.innerText, btn);
    }

    function copyCurrentAuthHeader(btn) {
      const token = currentLiveToken || '<BITTE_OBEN_MOCK_TOKEN_HOLEN>';
      copyToClipboard('Authorization: Bearer ' + token, btn);
    }

    // Lokaler Client-Store für sofortiges Wire-Tap Feedback (ergänzt Serverless /api/audit)
    function addClientAuditLog(entry) {
      try {
        const stored = JSON.parse(localStorage.getItem('btc_wiretap_logs') || '[]');
        stored.unshift({
          id: 'client_' + Date.now().toString(36),
          timestamp: new Date().toISOString(),
          ...entry
        });
        localStorage.setItem('btc_wiretap_logs', JSON.stringify(stored.slice(0, 20)));
      } catch (e) {}
      renderWireTap();
    }

    async function refreshAuditLogs() {
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        const serverLogs = data.logs || [];
        if (serverLogs.length > 0) {
          const stored = JSON.parse(localStorage.getItem('btc_wiretap_logs') || '[]');
          const merged = [...stored];
          serverLogs.forEach(sl => {
            if (!merged.find(m => m.id === sl.id || m.timestamp === sl.timestamp)) {
              merged.push(sl);
            }
          });
          merged.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
          localStorage.setItem('btc_wiretap_logs', JSON.stringify(merged.slice(0, 30)));
        }
      } catch (e) {}
      renderWireTap();
    }

    function renderWireTap() {
      const feed = document.getElementById('auditLogFeed');
      const totalText = document.getElementById('auditTotalText');
      if (!feed) return;

      const logs = JSON.parse(localStorage.getItem('btc_wiretap_logs') || '[]');
      if (totalText) totalText.innerText = logs.length + ' Events';

      if (logs.length === 0) {
        feed.innerHTML = '<div style="text-align:center; padding:20px 10px; color:#64748B; font-size:0.76rem;">Noch keine Events erfasst. Klicke links auf einen Testbutton.</div>';
        return;
      }

      feed.innerHTML = logs.map(l => {
        const isSuccess = l.status >= 200 && l.status < 300;
        const statusBg = isSuccess ? '#DCFCE7' : '#FEE2E2';
        const statusColor = isSuccess ? '#166534' : '#991B1B';
        const timeStr = new Date(l.timestamp).toLocaleTimeString();

        return '<div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:6px; padding:8px 10px; font-size:0.75rem; box-shadow:0 1px 2px rgba(0,0,0,0.02);">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
            '<span style="font-weight:700; font-family:monospace; color:#475569;">' + timeStr + '</span>' +
            '<span style="background:' + statusBg + '; color:' + statusColor + '; padding:1px 5px; border-radius:4px; font-weight:700; font-size:0.68rem;">' + l.status + '</span>' +
          '</div>' +
          '<div style="font-weight:600; color:#0A3D62; margin-bottom:2px; word-break:break-all;">Client: ' + (l.client || 'Unknown') + '</div>' +
          '<div style="color:#0284C7; font-size:0.7rem; margin-bottom:3px;">Auth: ' + (l.authMethod || 'Bearer') + '</div>' +
          '<div style="font-family:monospace; color:#334155; font-size:0.7rem; background:#F8FAFC; padding:2px 4px; border-radius:3px; word-break:break-all;">' +
            '<span style="color:#0284C7; font-weight:700;">' + l.method + '</span> ' + l.path +
          '</div>' +
        '</div>';
      }).join('');
    }

    function copyBtpToken(type, btn) {
      const token = btpTokens[type];
      copyToClipboard(token, btn);
    }

    function copyToClipboard(text, btn) {
      if (!text) { alert("Bitte hole zuerst ein Token!"); return; }
      const orig = btn.innerText;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          btn.innerText = "Kopiert";
          setTimeout(() => { btn.innerText = orig; }, 2000);
        });
      } else {
        fallbackCopy(text, () => {
          btn.innerText = "Kopiert";
          setTimeout(() => { btn.innerText = orig; }, 2000);
        });
      }
    }

    function fallbackCopy(text, onSuccess) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          onSuccess();
          return;
        }
      } catch (err) {}
      window.prompt("Token markieren und kopieren (Strg+C / Cmd+C):", text);
    }

    // Beim Laden und alle 5 Sekunden Wire-Tap pollen
    document.addEventListener('DOMContentLoaded', () => {
      refreshAuditLogs();
      setInterval(refreshAuditLogs, 5000);
    });
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
