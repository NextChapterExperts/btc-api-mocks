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

// In-Memory Request & Audit Log (Letzte 20 Aufrufe für Live-Monitoring & KRITIS-Nachweis)
const auditLogs = [];
function recordAuditLog(entry) {
  auditLogs.unshift({
    id: 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (auditLogs.length > 30) auditLogs.pop();
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
    label: 'Developer Key (Developer Hub Application)',
    tokenUrl: process.env.BTP_DEVHUB_TOKEN_URL || 'https://872f920dtrial.authentication.us10.hana.ondemand.com/oauth/token',
    clientId: process.env.BTP_DEVHUB_CLIENT_ID || 'sb-dh-3b72cd96-320d-4551-9fe8-9d9c6e30349a!b711904|it-rt-872f920dtrial!b26655',
    clientSecret: process.env.BTP_DEVHUB_CLIENT_SECRET || 'a8d3e87a-1e53-4f99-8620-44f7d9b443b4$CLkv5lmOWJUnk6wEKHgMmdJpPYEzrElVzw1wuvFE13o=',
    endpoint: process.env.BTP_DEVHUB_ENDPOINT || 'https://872f920dtrial-d58ffe5a9522426e865d4e1cc662a85c.a.integration.cloud.sap/demo'
  },
  servicekey: {
    id: 'servicekey',
    label: 'Service Key (Process Integration Runtime it-rt)',
    tokenUrl: process.env.BTP_SVC_TOKEN_URL || 'https://872f920dtrial.authentication.us10.hana.ondemand.com/oauth/token',
    clientId: process.env.BTP_SVC_CLIENT_ID || 'sb-f581317a-f129-40a9-a0fb-cdf54f81e053!b711904|it-rt-872f920dtrial!b26655',
    clientSecret: process.env.BTP_SVC_CLIENT_SECRET || '4452ad3d-2f32-4fa2-b70a-05c476416f3f$GrETQG-ri2w2Cdl73s4lJ0XWtomSPU5Iu46MLF025ko=',
    endpoint: process.env.BTP_SVC_ENDPOINT || 'https://872f920dtrial-d58ffe5a9522426e865d4e1cc662a85c.a.integration.cloud.sap/demo'
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
    return res.status(500).json({ error: 'Failed to connect to BTP XSUAA', message: err.message });
  }
});

// Endpoint to fetch recent audit logs as JSON (für Live-Dashboard & Polling)
app.get('/api/audit', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json({
    totalLogs: auditLogs.length,
    serverTime: new Date().toISOString(),
    logs: auditLogs
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
    return res.status(500).json({ error: 'Failed to invoke Integration Cell', message: err.message });
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
    <h1>⚡ Schnittstelle 1: REST & OAuth 2.0 (Swagger UI)</h1>
    <div>
      <a href="/" style="margin-right: 18px;">🏠 Zurück zur Gesamtübersicht</a>
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
      padding: 30px 20px;
    }
    .container {
      max-width: 1150px;
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
      padding: 30px 32px;
      border-bottom: 1px solid rgba(255,255,255,0.15);
    }
    .header h1 { margin: 0 0 6px 0; font-size: 1.65rem; font-weight: 700; color: #FFFFFF; }
    .header p { margin: 0; color: #E0F2FE; font-size: 0.95rem; }
    
    /* 4 Schnittstellen Kacheln oben */
    .protocol-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 22px;
    }
    .protocol-card {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 8px;
      padding: 14px 16px;
      cursor: pointer;
      backdrop-filter: blur(4px);
      transition: all 0.15s ease-in-out;
    }
    .protocol-card:hover {
      background: rgba(255, 255, 255, 0.25);
      border-color: rgba(255, 255, 255, 0.4);
    }
    .protocol-card.selected {
      background: #FFFFFF;
      color: var(--text-main);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      border-color: #FFFFFF;
    }
    .protocol-card.selected h3 { color: #0A58CA; }
    .protocol-card h3 { margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 600; color: #FFFFFF; display: flex; align-items: center; justify-content: space-between; }
    .protocol-card .badge {
      font-size: 0.7rem;
      padding: 2px 7px;
      border-radius: 6px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.25);
      color: #FFFFFF;
    }
    .protocol-card.selected .badge { background: #E0F2FE; color: #0369A1; }
    .protocol-card p { margin: 0; font-size: 0.8rem; color: #F0F9FF; line-height: 1.4; }
    .protocol-card.selected p { color: #64748B; }

    .body-content { padding: 28px 32px; }
    
    /* Freundliche, einheitliche Button-Styles */
    .btn-token {
      background: #0A58CA;
      color: #FFFFFF;
      border: 1px solid #084298;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 0.83rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 0.83rem;
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      transition: all 0.15s ease;
    }
    .btn-link:hover {
      background: #EFF6FF;
      border-color: #93C5FD;
      color: #084298;
    }

    /* Live Interactive Token Generator Bar */
    .token-generator-box {
      background: #F8FAFC;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .token-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .token-header-row h4 { margin: 0; color: #334155; font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .token-display-row {
      display: flex;
      align-items: center;
      gap: 10px;
      background: white;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 6px 12px;
    }
    .token-display-row code {
      flex: 1;
      color: #334155;
      font-family: monospace;
      font-size: 0.84rem;
      word-break: break-all;
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

    /* Interaktives APIM Live Test Cockpit (Dezent & Ruhig) */
    .apim-cockpit-box {
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    .apim-cockpit-box h4 {
      margin: 0 0 10px 0;
      color: #1E293B;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .apim-cockpit-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
    }
    @media (max-width: 768px) {
      .apim-cockpit-grid { grid-template-columns: 1fr; }
    }
    .apim-field label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
    .apim-field input {
      width: 100%;
      padding: 7px 11px;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.83rem;
      background: white;
      color: #0F172A;
      transition: border 0.15s ease;
    }
    .apim-field input:focus {
      outline: none;
      border-color: #2563EB;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
    }
    .apim-hint {
      font-size: 0.78rem;
      color: #64748B;
      margin-top: 8px;
      line-height: 1.4;
    }

    /* Tabs Header - Kompakt & Umbruchsicher */
    .tabs-header {
      display: flex;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 20px;
      gap: 4px;
    }
    .tab-btn {
      padding: 8px 14px;
      border: none;
      background: none;
      font-size: 0.85rem;
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

    /* Code Block */
    .code-box {
      background: var(--code-bg);
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
      border: 1px solid #334155;
    }
    .code-box-header {
      background: #1E293B;
      padding: 7px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #94A3B8;
      font-size: 0.8rem;
      font-family: monospace;
      border-bottom: 1px solid #334155;
    }
    .copy-btn {
      background: #334155;
      color: #F1F5F9;
      border: 1px solid #475569;
      padding: 3px 9px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.72rem;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .copy-btn:hover { background: #475569; }
    .copy-btn.copied { background: #059669; border-color: #059669; color: white; }
    pre {
      margin: 0;
      padding: 14px 16px;
      overflow-x: auto;
      color: #E2E8F0;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.83rem;
      line-height: 1.5;
    }
    
    .note {
      background: #F8FAFC;
      border-left: 4px solid #0A58CA;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 18px;
      font-size: 0.88rem;
      color: #1E293B;
      line-height: 1.5;
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
    }
    .note-purple {
      background: #F0F9FF;
      border-left-color: #0284C7;
      color: #0C4A6E;
    }

    /* Modern Endpoint & URL Cards */
    .endpoint-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .endpoint-card:hover {
      border-color: #CBD5E1;
    }
    .endpoint-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }
    .endpoint-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: #1E293B;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .method-badge {
      font-size: 0.72rem;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 4px;
      font-family: monospace;
      letter-spacing: 0.5px;
    }
    .badge-get {
      background: #DCFCE7;
      color: #166534;
      border: 1px solid #86EFAC;
    }
    .badge-post {
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FCD34D;
    }
    .url-display-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 10px;
      gap: 10px;
    }
    .url-display-text {
      color: #38BDF8;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.82rem;
      word-break: break-all;
    }
    .endpoint-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      font-size: 0.76rem;
      color: #64748B;
      margin-bottom: 6px;
    }
    .meta-tag {
      background: #F1F5F9;
      border: 1px solid #E2E8F0;
      color: #334155;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
      word-break: break-all;
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
    .btn-sm-action:hover {
      background: #E2E8F0;
      color: #0F172A;
    }
    .btn-sm-action.primary {
      background: #0D9488;
      color: white;
      border-color: #0D9488;
    }
    .btn-sm-action.primary:hover {
      background: #0F766E;
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="header">
      <h1>⚡ BTC Energy API Mock Suite (4 Protokolle)</h1>
      <p>Die All-in-One Demoumgebung für SAP BTP API Management, Integration Cell & Developer Hub</p>
      
      <!-- 4 SCHNITTSTELLEN KACHELN -->
      <div class="protocol-grid">
        <div class="protocol-card selected" onclick="selectProtocol('rest')">
          <h3>1. REST & OAuth2 <span class="badge">OpenAPI 3.0</span></h3>
          <p>Smart Meter Ingestion mit Client Credentials & Refresh Flow</p>
        </div>
        <div class="protocol-card" onclick="selectProtocol('odata-v2')">
          <h3>2. SAP OData v2 <span class="badge">EDMX $metadata</span></h3>
          <p>Nativer IS-U Zählerdaten Service für Auto-Proxy Generierung</p>
        </div>
        <div class="protocol-card" onclick="selectProtocol('odata-v4')">
          <h3>3. SAP OData v4 <span class="badge">OASIS v4</span></h3>
          <p>Moderne CAP / RAP Zähler-Entitäten mit flacher JSON-Struktur</p>
        </div>
        <div class="protocol-card" onclick="selectProtocol('soap')">
          <h3>4. Legacy SOAP <span class="badge">WSDL 1.1</span></h3>
          <p>Klassischer XML Web Service mit SOAP-Envelope & SOAPAction</p>
        </div>
      </div>
    </div>

    <div class="body-content">

      <!-- OBERER BEREICH: INTERAKTIVES MOCK-SCHNITTSTELLEN LIVE-COCKPIT -->
      <div class="token-generator-box" style="background:#FFFFFF; border:1px solid #10B981; border-radius:10px; padding:18px 20px; box-shadow:0 2px 8px rgba(16,185,129,0.08);">
        <div class="token-header-row" style="margin-bottom:10px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.72rem; font-weight:700; color:#065F46; background:#D1FAE5; padding:3px 8px; border-radius:4px;">
                MOCK BACKEND PROVIDER
              </span>
              <h4 style="margin:0; font-size:1.1rem; color:#065F46;">
                🔐 1. Backend-Mock Live-Test & Provider-Token Cockpit
              </h4>
            </div>
            <div style="font-size:0.82rem; color:#64748B; margin-top:4px;">
              Keine Terminal-Konsole erforderlich: Hole das Provider-Token und teste die 4 Schnittstellen direkt nativ per Klick!
            </div>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select id="mockEndpointSelect" style="padding:7px 10px; border:1px solid #CBD5E1; border-radius:6px; font-size:0.82rem; font-weight:600; color:#1E293B; background:#F8FAFC;" onchange="onMockEndpointChange(this.value)">
              <option value="rest">1. REST API (/api/v1/smartmeters)</option>
              <option value="odata-v2">2. SAP OData v2 (/odata/v2/utility/MeterReadingSet)</option>
              <option value="odata-v4">3. SAP OData v4 (/odata/v4/utility/MeterReadings)</option>
              <option value="soap">4. Legacy SOAP (/soap/utility - GetMeterReading)</option>
            </select>
            <button id="btnFetchToken" class="btn-token" style="background:#059669;" onclick="fetchLiveToken()">
              <span>⚡ 1. Mock-Token holen</span>
            </button>
            <button id="btnInvokeMock" class="btn-token" style="background:#0D9488;" onclick="invokeMockLive()">
              <span>🚀 2. Schnittstelle live testen</span>
            </button>
          </div>
        </div>

        <div class="token-display-row">
          <span style="font-size:0.75rem; font-weight:700; color:#059669; white-space:nowrap;">OAuth 2.0 Bearer:</span>
          <code id="tokenDisplay" style="font-size:0.78rem;">&lt;Klicke oben auf 'Mock-Token holen', um Provider-Token zu generieren&gt;</code>
          <span id="tokenBadge" class="token-status-badge">Kein Token</span>
          <button class="copy-btn" onclick="copyLiveToken(this)">Kopieren</button>
        </div>

        <!-- Live Response Box for Mock API Direct Call -->
        <div id="mockLiveResultBox" style="display:none; margin-top:14px; background:#0F172A; border:1px solid #334155; border-radius:8px; padding:12px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span id="mockLiveStatusBadge" style="font-weight:700; font-size:0.82rem; color:#4ADE80;">✅ HTTP 200 OK</span>
              <span id="mockLiveEndpoint" style="font-size:0.75rem; color:#38BDF8; font-family:monospace; background:#1E293B; padding:2px 6px; border-radius:4px;"></span>
            </div>
            <span id="mockLiveDuration" style="font-size:0.72rem; color:#94A3B8;"></span>
          </div>
          <pre style="margin:0; padding:0; max-height:220px; overflow-y:auto;"><code id="mockLiveCode" style="color:#A7F3D0; font-size:0.75rem;"></code></pre>
          <div id="mockLiveExplanation" style="margin-top:8px; font-size:0.75rem; color:#93C5FD; border-top:1px solid #1E293B; padding-top:6px; line-height:1.4;"></div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 1: REST & OAUTH 2.0 -->
      <!-- ======================================================== -->
      <div id="section-rest" class="protocol-section">
        <div class="note">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <b style="font-size:0.95rem; color:#0F172A;">Schnittstelle 1: REST API (Smart Meter Ingestion)</b><br/>
              Standardisierte REST-Schnittstelle nach OpenAPI 3.0.3 für Zählerstands-Massendaten (Smart Meter Rollout).
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <a href="/docs" target="_blank" class="btn-link" style="background:#0284C7;">📖 Swagger UI öffnen</a>
              <a href="/openapi.json" target="_blank" class="btn-link">📜 OpenAPI 3.0 Spec</a>
            </div>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('rest', 'direct')">🌐 1. Endpunkte & URLs</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'dest')">⚙️ 2. BTP Destination</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'arch')">🏛️ 3. Architektur & Policies</button>
        </div>

        <!-- TAB 1: Endpunkte & URLs -->
        <div id="rest-direct" class="tab-pane active">
          <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:0.83rem; color:#166534; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>💡 <b>Tipp für SAP BTP / APIM:</b> Für automatischen Token-Refresh und Header-Injection konfiguriere die zentrale BTP Destination <b>BTC_UTILITY_MOCK_API</b>.</span>
            <button class="btn-sm-action primary" onclick="switchInnerTab('rest', 'dest')">⚙️ Zu BTP Destination &rarr;</button>
          </div>

          <!-- Card 1: Token Endpoint -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-post">POST</span>
                <span>OAuth 2.0 Token Endpoint (Client Credentials Flow)</span>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="btn-sm-action primary" onclick="fetchLiveToken()">⚡ Token jetzt holen</button>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/oauth/token</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/oauth/token', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Header:</b></span>
              <span class="meta-tag">Content-Type: application/x-www-form-urlencoded</span>
              <button class="btn-sm-action" onclick="copyToClipboard('Content-Type: application/x-www-form-urlencoded', this)">Kopieren</button>
            </div>
            <div class="endpoint-meta" style="margin-top:6px;">
              <span><b>Body:</b></span>
              <span class="meta-tag">grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026</span>
              <button class="copy-btn" onclick="copyToClipboard('grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026', this)">Body kopieren</button>
            </div>
          </div>

          <!-- Card 2: Zählerdaten Ingestion Resource -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>Zählerdaten abrufen (Smart Meter Ingestion List)</span>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/api/v1/smartmeters</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/api/v1/smartmeters', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Header:</b></span>
              <span class="meta-tag">Authorization: Bearer &lt;aktiver_token&gt;</span>
              <button class="btn-sm-action" onclick="copyCurrentAuthHeader(this)">Auth-Header kopieren</button>
              <span class="meta-tag" style="margin-left:8px;">Accept: application/json</span>
            </div>
          </div>

          <!-- Card 3: Spezifikationen -->
          <div class="endpoint-card" style="background:#F8FAFC; border-style:dashed;">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span>📖 API Dokumentation & Spezifikation</span>
              </div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;">
              <a href="/docs" target="_blank" class="btn-link" style="background:#0284C7; font-size:0.82rem;">📖 Interaktive Swagger UI (/docs)</a>
              <a href="/openapi.json" target="_blank" class="btn-link" style="font-size:0.82rem;">📜 OpenAPI 3.0.3 JSON Spezifikation (/openapi.json)</a>
              <button class="btn-sm-action" onclick="copyToClipboard('${hostUrl}/openapi.json', this)">📋 Spezifikations-URL kopieren</button>
            </div>
          </div>
        </div>

        <!-- TAB 2: BTP Destination -->
        <div id="rest-dest" class="tab-pane">
          <div class="note note-purple">
            <b>Zentrale BTP Destination für SAP Integration Suite / Integration Cell:</b><br/>
            Lege diese Destination einmalig im SAP BTP Cockpit unter <i>Connectivity &rarr; Destinations</i> an.
            Sie dient als Single Source of Truth (SSoT) für alle Proxies im API Management und API-Artefakte auf der Integration Cell.
          </div>
          <div class="code-box">
            <div class="code-box-header">
              <span>BTP Destination: BTC_UTILITY_MOCK_API (OAuth2ClientCredentials)</span>
              <button class="copy-btn" onclick="copyCode(this)">Destination kopieren</button>
            </div>
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
          <h4>Schritte im SAP API Portal:</h4>
          <ol style="line-height:1.7; font-size:0.9rem; color:#334155;">
            <li><b>API Proxy anlegen:</b> Wähle <i>Create API Proxy</i>.</li>
            <li><b>Source:</b> Wähle <i>OpenAPI</i> mit URL <code>${hostUrl}/openapi.json</code> oder <i>URL</i> mit Basis-URL <code>${hostUrl}/api/v1/</code>.</li>
            <li><b>Target Endpoint:</b> Hinterlege die BTP Destination <code>BTC_UTILITY_MOCK_API</code>. Die SAP BTP übernimmt den Token-Refresh und Header-Injection vollautomatisch!</li>
            <li><b>Integration Cell (Optional):</b> Durch die Eigenschaft <code>IntegrationCell.Include = true</code> wird die Destination automatisch auf deine Kubernetes Edge Runtime synchronisiert.</li>
          </ol>
        </div>

        <!-- TAB 3: Architektur & Policies -->
        <div id="rest-arch" class="tab-pane">
          <!-- Architecture SVG Blueprint -->
          <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:8px; padding:16px; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size:0.85rem; font-weight:700; color:#0F172A; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
              <span>🏛️ End-to-End Referenzarchitektur: SAP Integration Suite &amp; API Management</span>
            </div>
            <svg viewBox="0 0 880 220" width="100%" height="auto" style="max-width:880px; display:block; margin:0 auto; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <defs>
                <linearGradient id="gradClient1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#EFF6FF" />
                  <stop offset="100%" stop-color="#DBEAFE" />
                </linearGradient>
                <linearGradient id="gradApim1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#F5F3FF" />
                  <stop offset="100%" stop-color="#EDE9FE" />
                </linearGradient>
                <linearGradient id="gradBackend1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ECFDF5" />
                  <stop offset="100%" stop-color="#D1FAE5" />
                </linearGradient>
                <marker id="arrow1" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
                </marker>
              </defs>

              <!-- Zone 1: Consumer -->
              <rect x="10" y="15" width="220" height="185" rx="8" fill="url(#gradClient1)" stroke="#93C5FD" stroke-width="1.5" />
              <text x="25" y="40" font-size="13" font-weight="700" fill="#1E3A8A">1. Konsument / Client</text>
              <rect x="25" y="52" width="190" height="38" rx="6" fill="#FFFFFF" stroke="#BFDBFE" />
              <text x="35" y="72" font-size="11" font-weight="600" fill="#1E293B">Apps / Web / Smart Meter</text>
              <text x="35" y="84" font-size="9" fill="#64748B">Joule AI / MaKo Gateway</text>

              <rect x="25" y="100" width="190" height="42" rx="6" fill="#EFF6FF" stroke="#93C5FD" stroke-dasharray="3 3" />
              <text x="35" y="117" font-size="10.5" font-weight="700" fill="#1D4ED8">🔑 Client Authentifizierung</text>
              <text x="35" y="132" font-size="10" font-family="monospace" fill="#0F172A">Header: apikey &lt;DevKey&gt;</text>
              <text x="25" y="165" font-size="9.5" fill="#64748B">• Kein Backend-Token nötig</text>
              <text x="25" y="180" font-size="9.5" fill="#64748B">• Validierung am API-Gateway</text>

              <!-- Arrow 1 -> 2 -->
              <path d="M 230 110 L 290 110" stroke="#475569" stroke-width="2" marker-end="url(#arrow1)" />
              <text x="235" y="100" font-size="9" font-weight="600" fill="#475569">HTTPS / apikey</text>

              <!-- Zone 2: SAP APIM & Integration Cell -->
              <rect x="300" y="10" width="280" height="195" rx="8" fill="url(#gradApim1)" stroke="#C4B5FD" stroke-width="1.5" />
              <text x="315" y="32" font-size="13" font-weight="700" fill="#5B21B6">2. SAP BTP Integration Suite</text>
              <text x="315" y="47" font-size="9.5" font-weight="600" fill="#7C3AED">API Management &amp; Integration Cell</text>

              <rect x="315" y="58" width="250" height="42" rx="6" fill="#FFFFFF" stroke="#DDD6FE" />
              <text x="325" y="75" font-size="11" font-weight="700" fill="#6D28D9">🛡️ Ingress Proxy &amp; Policies</text>
              <text x="325" y="90" font-size="9.5" fill="#4B5563">VerifyAPIKey (Developer Hub Prüfung)</text>

              <rect x="315" y="108" width="250" height="48" rx="6" fill="#FFFFFF" stroke="#DDD6FE" />
              <text x="325" y="125" font-size="11" font-weight="700" fill="#6D28D9">⚙️ Destination Service</text>
              <text x="325" y="139" font-size="10" font-family="monospace" fill="#0F172A">BTC_UTILITY_MOCK_API</text>
              <text x="325" y="150" font-size="8.5" fill="#6B7280">OAuth2 Client Credentials Auto-Injection</text>

              <text x="315" y="180" font-size="9.5" fill="#5B21B6">✓ K8s Edge Pods &amp; Istio Envoy Gateway</text>

              <!-- Arrow 2 -> 3 -->
              <path d="M 580 132 L 640 132" stroke="#475569" stroke-width="2" marker-end="url(#arrow1)" />
              <text x="583" y="122" font-size="9" font-weight="600" fill="#065F46">OAuth Bearer</text>

              <!-- Zone 3: Mock Backend Provider -->
              <rect x="650" y="15" width="220" height="185" rx="8" fill="url(#gradBackend1)" stroke="#6EE7B7" stroke-width="1.5" />
              <text x="665" y="40" font-size="13" font-weight="700" fill="#065F46">3. BTC Mock Backend</text>
              <text x="665" y="53" font-size="9.5" fill="#047857">Vercel Serverless Platform</text>

              <rect x="665" y="65" width="190" height="38" rx="6" fill="#FFFFFF" stroke="#A7F3D0" />
              <text x="675" y="82" font-size="10.5" font-weight="700" fill="#047857">🔐 Auth Server (/oauth/token)</text>
              <text x="675" y="94" font-size="9" fill="#64748B">Client Credentials (btc-demo-client)</text>

              <rect x="665" y="112" width="190" height="52" rx="6" fill="#FFFFFF" stroke="#A7F3D0" />
              <text x="675" y="130" font-size="10.5" font-weight="700" fill="#047857">⚡ Protected Resources</text>
              <text x="675" y="144" font-size="9" fill="#334155">• REST / OData v2/v4 / SOAP</text>
              <text x="675" y="156" font-size="9" fill="#334155">• IS-U Zählerstände (15-Min-Takt)</text>

              <text x="665" y="184" font-size="9.5" fill="#065F46">✓ BSI C5 / KRITIS entkoppelt</text>
            </svg>
          </div>

          <!-- Implementation Specifics -->
          <div class="note">
            <b>Implementierungs-Spezifika für REST:</b><br/>
            • <b>OpenAPI-Import:</b> Das API Portal parst <code>/openapi.json</code> und erzeugt automatisch alle Pfade (<code>/api/v1/smartmeters</code>).<br/>
            • <b>Enterprise Shield:</b> Konsumenten nutzen ausschließlich ihren <b>Developer Key</b> (Header <code>apikey</code>). APIM tauscht den Key über die BTP Destination gegen den Backend-OAuth2-Token aus.<br/>
            • <b>Data Pruning (Stand 2026-09-14):</b> Filterung und Projektion für KI-Agenten / Joule gehören in das API-Artefakt bzw. den iFlow darunter, da MCP-Server-Artefakte auf der Integration Cell keine Mediation-Steps unterstützen!
          </div>

          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_DevHub.xml (ProxyEndpoint PreFlow)</span><button class="copy-btn" onclick="copyCode(this)">Policy kopieren</button></div>
            <pre><code>&lt;VerifyAPIKey async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;APIKey ref="request.header.apikey"/&gt;
&lt;/VerifyAPIKey&gt;</code></pre>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 2: SAP ODATA V2 -->
      <!-- ======================================================== -->
      <div id="section-odata-v2" class="protocol-section" style="display:none;">
        <div class="note">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <b style="font-size:0.95rem; color:#0F172A;">Schnittstelle 2: SAP OData v2 Service (IS-U Utility Readings)</b><br/>
              Natives OData v2 Format für SAP IS-U / S/4HANA Zählerstandsdaten mit EDMX $metadata für Auto-Proxy Generierung.
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <a href="/odata/v2/utility/$metadata" target="_blank" class="btn-link" style="background:#0284C7;">📜 $metadata XML ansehen</a>
            </div>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('odata-v2', 'direct')">🌐 1. Endpunkte & URLs</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'dest')">⚙️ 2. BTP Destination</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'arch')">🏛️ 3. Architektur & Policies</button>
        </div>

        <!-- TAB 1: Endpunkte & URLs -->
        <div id="odata-v2-direct" class="tab-pane active">
          <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:0.83rem; color:#166534; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>💡 <b>Tipp für OData Auto-Proxy:</b> Gib im SAP API Portal einfach die <b>$metadata URL</b> ein – APIM liest alle EntitySets (<code>MeterReadingSet</code>) automatisch ein!</span>
            <button class="btn-sm-action primary" onclick="switchInnerTab('odata-v2', 'dest')">⚙️ Zu BTP Destination &rarr;</button>
          </div>

          <!-- Card 1: $metadata -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>EDMX Metadaten-Dokument ($metadata)</span>
              </div>
              <div style="display:flex; gap:6px;">
                <a href="/odata/v2/utility/$metadata" target="_blank" class="btn-sm-action">🔗 Im Browser öffnen</a>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/odata/v2/utility/$metadata</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v2/utility/$metadata', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Zweck:</b> Öffentlich abrufbar für automatische Proxy-Erstellung (Auto-Import von <code>MeterReadingSet</code>) im SAP API Portal.</span>
            </div>
          </div>

          <!-- Card 2: EntitySet MeterReadingSet -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>EntitySet: Alle Zählerstände (/odata/v2/utility/MeterReadingSet)</span>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/odata/v2/utility/MeterReadingSet</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v2/utility/MeterReadingSet', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Header:</b></span>
              <span class="meta-tag">Authorization: Bearer &lt;aktiver_token&gt;</span>
              <button class="btn-sm-action" onclick="copyCurrentAuthHeader(this)">Auth-Header kopieren</button>
              <span class="meta-tag" style="margin-left:8px;">Accept: application/json</span>
            </div>
          </div>

          <!-- Card 3: Filter Query -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>Gefilterte Abfrage ($filter auf Zählernummer)</span>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/odata/v2/utility/MeterReadingSet?$filter=MeterId eq 'DE-OL-MTR-001'</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v2/utility/MeterReadingSet?$filter=MeterId eq \'DE-OL-MTR-001\'', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Header:</b></span>
              <span class="meta-tag">Authorization: Bearer &lt;aktiver_token&gt;</span>
              <span class="meta-tag">Accept: application/json</span>
            </div>
          </div>
        </div>

        <!-- TAB 2: BTP Destination & Proxy Setup -->
        <div id="odata-v2-dest" class="tab-pane">
          <div class="note note-purple">
            <b>BTP Destination & OData Auto-Proxy Setup:</b><br/>
            Die Destination <code>BTC_UTILITY_MOCK_API</code> wird sowohl vom klassischen API Management als auch von der Integration Cell für den Auto-Proxy-Import genutzt.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API (OAuth2ClientCredentials)</span><button class="copy-btn" onclick="copyCode(this)">Destination kopieren</button></div>
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
          <h4>OData Auto-Proxy Schritte im SAP API Portal:</h4>
          <ol style="line-height:1.7; font-size:0.9rem; color:#334155;">
            <li><b>Neuen Proxy anlegen:</b> Wähle <i>Create API Proxy</i>.</li>
            <li><b>Source:</b> Wähle <i>API Definition</i> &rarr; <i>EDMX</i>.</li>
            <li><b>URL angeben:</b> Trage <code>${hostUrl}/odata/v2/utility/$metadata</code> ein. APIM liest die EntitySets (<code>MeterReadingSet</code>) automatisch ein!</li>
            <li><b>Target Endpoint:</b> Verknüpfe den Proxy mit der BTP Destination <code>BTC_UTILITY_MOCK_API</code>.</li>
          </ol>
        </div>

        <!-- TAB 3: Architektur & Policies -->
        <div id="odata-v2-arch" class="tab-pane">
          <div class="note">
            <b>OData v2 Implementierungs-Architektur:</b><br/>
            • <b>Auto-Proxy Generierung:</b> Im Gegensatz zu reinem REST liest SAP APIM über das EDMX <code>$metadata</code>-Dokument alle Entitäten, Navigationen und Datentypen vollautomatisch ein.<br/>
            • <b>OData Schema Validation:</b> Die Policy schützt vor fehlerhaften Abfragen, Injections und übermäßigen <code>$expand</code>-Tiefen.<br/>
            • <b>Developer Hub Absicherung:</b> Externe Konsumenten authentifizieren sich per Header <code>apikey</code>.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_DevHub.xml</span><button class="copy-btn" onclick="copyCode(this)">Policy kopieren</button></div>
            <pre><code>&lt;VerifyAPIKey async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;APIKey ref="request.header.apikey"/&gt;
&lt;/VerifyAPIKey&gt;</code></pre>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 3: SAP ODATA V4 -->
      <!-- ======================================================== -->
      <div id="section-odata-v4" class="protocol-section" style="display:none;">
        <div class="note">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <b style="font-size:0.95rem; color:#0F172A;">Schnittstelle 3: SAP OData v4 Service (Modern RAP / CAP)</b><br/>
              Moderne REST-Entitäten im OASIS OData v4 Standard mit schlanker, flacher JSON-Payload für Cloud Applications.
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <a href="/odata/v4/utility/$metadata" target="_blank" class="btn-link" style="background:#0284C7;">📜 OData v4 $metadata XML</a>
            </div>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('odata-v4', 'direct')">🌐 1. Endpunkte & URLs</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v4', 'dest')">⚙️ 2. BTP Destination</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v4', 'arch')">🏛️ 3. Architektur & Policies</button>
        </div>

        <!-- TAB 1: Endpunkte & URLs -->
        <div id="odata-v4-direct" class="tab-pane active">
          <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:0.83rem; color:#166534; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>💡 <b>OASIS OData v4:</b> Flache JSON-Payload mit <code>@odata.context</code> und <code>value</code>-Array für optimierte Cloud-Verarbeitung.</span>
            <button class="btn-sm-action primary" onclick="switchInnerTab('odata-v4', 'dest')">⚙️ Zu BTP Destination &rarr;</button>
          </div>

          <!-- Card 1: $metadata -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>OData v4 Metadaten-Dokument ($metadata)</span>
              </div>
              <div style="display:flex; gap:6px;">
                <a href="/odata/v4/utility/$metadata" target="_blank" class="btn-sm-action">🔗 Im Browser öffnen</a>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/odata/v4/utility/$metadata</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v4/utility/$metadata', this)">URL kopieren</button>
            </div>
          </div>

          <!-- Card 2: EntitySet MeterReadings -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>EntitySet: MeterReadings (/odata/v4/utility/MeterReadings)</span>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/odata/v4/utility/MeterReadings</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/odata/v4/utility/MeterReadings', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Header:</b></span>
              <span class="meta-tag">Authorization: Bearer &lt;aktiver_token&gt;</span>
              <button class="btn-sm-action" onclick="copyCurrentAuthHeader(this)">Auth-Header kopieren</button>
              <span class="meta-tag" style="margin-left:8px;">Accept: application/json</span>
            </div>
          </div>
        </div>

        <!-- TAB 2: Destination & Setup -->
        <div id="odata-v4-dest" class="tab-pane">
          <div class="note note-purple">
            <b>BTP Destination & OData v4 Proxy Setup:</b><br/>
            Verwendet die identische Destination <code>BTC_UTILITY_MOCK_API</code>.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API</span><button class="copy-btn" onclick="copyCode(this)">Destination kopieren</button></div>
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

        <!-- TAB 3: Architektur & Policies -->
        <div id="odata-v4-arch" class="tab-pane">
          <div class="note">
            <b>OData v4 RAP / CAP Implementierungs-Architektur:</b><br/>
            • <b>Moderne Architektur:</b> Entspricht den Standards moderner SAP RAP (ABAP RESTful Application Programming Model) und CAP (Cloud Application Programming Model) Services.<br/>
            • <b>Effiziente Token-Ökonomie:</b> Durch die flachere JSON-Struktur spart OData v4 ca. 25–35% Token im Vergleich zu OData v2 XML/JSON ein, wenn Daten an LLM-Agenten übergeben werden.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_ODataV4.xml</span><button class="copy-btn" onclick="copyCode(this)">Policy kopieren</button></div>
            <pre><code>&lt;VerifyAPIKey async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;APIKey ref="request.header.apikey"/&gt;
&lt;/VerifyAPIKey&gt;</code></pre>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 4: SOAP 1.1 / WSDL -->
      <!-- ======================================================== -->
      <div id="section-soap" class="protocol-section" style="display:none;">
        <div class="note">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <b style="font-size:0.95rem; color:#0F172A;">Schnittstelle 4: Legacy SOAP 1.1 Service</b><br/>
              Klassischer XML Web Service mit SOAP-Envelope, WSDL-Definition und SOAPAction Header.
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <a href="/soap/utility?wsdl" target="_blank" class="btn-link" style="background:#0284C7;">📜 WSDL ansehen / herunterladen</a>
            </div>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('soap', 'direct')">🌐 1. Endpunkte & URLs</button>
          <button class="tab-btn" onclick="switchInnerTab('soap', 'dest')">⚙️ 2. BTP Destination</button>
          <button class="tab-btn" onclick="switchInnerTab('soap', 'arch')">🏛️ 3. Architektur & Policies</button>
        </div>

        <!-- TAB 1: Endpunkte & URLs -->
        <div id="soap-direct" class="tab-pane active">
          <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:0.83rem; color:#166534; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>💡 <b>WSDL Service Contract:</b> Importiere <code>${hostUrl}/soap/utility?wsdl</code> im API Portal, um Operationen wie <code>GetMeterReading</code> automatisch als Route zu generieren.</span>
            <button class="btn-sm-action primary" onclick="switchInnerTab('soap', 'dest')">⚙️ Zu BTP Destination &rarr;</button>
          </div>

          <!-- Card 1: WSDL -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-get">GET</span>
                <span>WSDL Service Definition (/soap/utility?wsdl)</span>
              </div>
              <div style="display:flex; gap:6px;">
                <a href="/soap/utility?wsdl" target="_blank" class="btn-sm-action">🔗 WSDL öffnen</a>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/soap/utility?wsdl</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/soap/utility?wsdl', this)">URL kopieren</button>
            </div>
          </div>

          <!-- Card 2: SOAP Operation -->
          <div class="endpoint-card">
            <div class="endpoint-header-row">
              <div class="endpoint-title">
                <span class="method-badge badge-post">POST</span>
                <span>SOAP Endpoint (/soap/utility) - Operation: GetMeterReading</span>
              </div>
            </div>
            <div class="url-display-bar">
              <span class="url-display-text">${hostUrl}/soap/utility</span>
              <button class="copy-btn" onclick="copyToClipboard('${hostUrl}/soap/utility', this)">URL kopieren</button>
            </div>
            <div class="endpoint-meta">
              <span><b>Header:</b></span>
              <span class="meta-tag">Content-Type: text/xml; charset=utf-8</span>
              <button class="btn-sm-action" onclick="copyToClipboard('Content-Type: text/xml; charset=utf-8', this)">Kopieren</button>
            </div>
            <div class="endpoint-meta" style="margin-top:4px;">
              <span><b>Header:</b></span>
              <span class="meta-tag">SOAPAction: http://btc.de/energy/metering/soap/GetMeterReading</span>
              <button class="btn-sm-action" onclick="copyToClipboard('SOAPAction: http://btc.de/energy/metering/soap/GetMeterReading', this)">Kopieren</button>
            </div>
            <div class="endpoint-meta" style="margin-top:4px;">
              <span><b>Header:</b></span>
              <span class="meta-tag">Authorization: Bearer &lt;aktiver_token&gt;</span>
              <button class="btn-sm-action" onclick="copyCurrentAuthHeader(this)">Auth-Header kopieren</button>
            </div>

            <!-- XML Body Box -->
            <div style="margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:0.75rem; font-weight:700; color:#475569;">SOAP XML Request Envelope:</span>
                <button class="copy-btn" onclick="copyCode(this)">XML kopieren</button>
              </div>
              <div class="code-box" style="margin-bottom:0;">
                <pre><code>&lt;soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:btc="http://btc.de/energy/metering/soap"&gt;
   &lt;soapenv:Header/&gt;
   &lt;soapenv:Body&gt;
      &lt;btc:GetMeterReadingRequest&gt;
         &lt;btc:MeterId&gt;DE-OL-MTR-002&lt;/btc:MeterId&gt;
      &lt;/btc:GetMeterReadingRequest&gt;
   &lt;/soapenv:Body&gt;
&lt;/soapenv:Envelope&gt;</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: Destination & Setup -->
        <div id="soap-dest" class="tab-pane">
          <div class="note note-purple">
            <b>SOAP-to-REST oder Pass-Through im APIM:</b><br/>
            SOAP-Proxies können als Passthrough oder via XSLT / XML-to-JSON Policies im APIM transformiert werden.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API</span><button class="copy-btn" onclick="copyCode(this)">Destination kopieren</button></div>
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
          <h4>Vorgehen für SOAP im API Portal:</h4>
          <ol style="line-height:1.7; font-size:0.9rem; color:#334155;">
            <li>Wähle <b>Create API Proxy</b>.</li>
            <li>Source: Wähle <b>WSDL</b> und gib ein: <code>${hostUrl}/soap/utility?wsdl</code></li>
            <li>Port & Operation: Wähle <code>MeterServiceSoapPort</code> ➔ generiert die Route für <code>GetMeterReading</code>.</li>
          </ol>
        </div>

        <!-- TAB 3: Architektur & Policies -->
        <div id="soap-arch" class="tab-pane">
          <div class="note">
            <b>Legacy SOAP Mediation Architektur:</b><br/>
            • <b>WSDL-to-REST Transformation:</b> APIM kann alte SOAP 1.1 Web Services modernisieren, indem XML-Payloads per <code>XMLtoJSON</code> und <code>JSONtoXML</code> Policies on-the-fly gewandelt werden.<br/>
            • <b>Legacy Schutz:</b> Das Backend verlangt strikt den SOAP-Envelope und die <code>SOAPAction</code>. APIM schirmt diese Altsysteme vor Überlastung ab.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_SOAP.xml</span><button class="copy-btn" onclick="copyCode(this)">Policy kopieren</button></div>
            <pre><code>&lt;VerifyAPIKey async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;APIKey ref="request.header.apikey"/&gt;
&lt;/VerifyAPIKey&gt;</code></pre>
          </div>
        </div>
      </div> <!-- closes section-soap -->

      <!-- ======================================================== -->
      <!-- UNTERER BEREICH: BTP INTEGRATION CELL COCKPIT (2 CLIENT CREDENTIALS BEREICHE) -->
      <!-- ======================================================== -->
      <div class="btp-section-container" style="margin-top:35px; padding-top:24px; border-top:2px dashed #CBD5E1;">
        <div style="margin-bottom:18px;">
          <h2 style="font-size:1.3rem; color:#0A3D62; margin:0 0 6px 0; display:flex; align-items:center; gap:8px;">
            <span>☁️ 2. SAP BTP Integration Cell Live-Verifikation & Inbound Token Cockpit</span>
          </h2>
          <p style="margin:0; font-size:0.88rem; color:#475569; line-height:1.5;">
            Verifiziere den echten API-Aufruf gegen das Edge Gateway auf der <b>Integration Cell</b> (<code>/demo</code>). 
            Teste und vergleiche hier die beiden Schlüsseltypen: Den über den <b>SAP Developer Hub</b> autorisierten <b>Developer Key</b> 
            gegenüber dem generischen <b>Service Key</b> der Cloud Integration Runtime.
          </p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap:20px;">
          
          <!-- BEREICH 1: DEVELOPER KEY -->
          <div class="btp-card" style="background:#FFFFFF; border:1px solid #93C5FD; border-radius:10px; padding:18px 20px; box-shadow:0 2px 8px rgba(10,88,202,0.06); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                  <span style="display:inline-block; font-size:0.72rem; font-weight:700; color:#0369A1; background:#E0F2FE; padding:3px 8px; border-radius:4px; margin-bottom:4px;">
                    PRODUKT-SUBSKRIPTION AKTIV
                  </span>
                  <h3 style="margin:0; font-size:1.05rem; color:#0A58CA; display:flex; align-items:center; gap:6px;">
                    🔑 Bereich A: Developer Key (Developer Hub)
                  </h3>
                </div>
                <span id="btpDevTokenBadge" class="token-status-badge">Kein Token</span>
              </div>
              <p style="font-size:0.82rem; color:#64748B; margin:0 0 12px 0; line-height:1.4;">
                Erstellt bei der Registrierung der Konsumenten-App im <b>SAP Developer Hub</b>. Besitzt die Berechtigung für das abonnierte API-Produkt auf der Integration Cell.
              </p>
              
              <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:8px 10px; font-size:0.75rem; font-family:monospace; margin-bottom:12px; color:#334155; line-height:1.4;">
                <div><b>Client ID:</b> sb-dh-3b72cd96-320d-4551-9fe8-9d9c6e30349a!b711904|it-rt-872f920dtrial!b26655</div>
                <div><b>Grant Type:</b> client_credentials (XSUAA OAuth2)</div>
                <div><b>Ziel-Endpoint:</b> /demo (Integration Cell)</div>
              </div>

              <!-- Token Display -->
              <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:0.75rem; font-weight:600; color:#475569;">Bearer Access Token:</span>
                  <button class="copy-btn" onclick="copyBtpToken('devhub', this)">Kopieren</button>
                </div>
                <code id="btpDevTokenDisplay" style="display:block; font-size:0.73rem; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:6px; padding:6px 10px; color:#1E293B; word-break:break-all; max-height:45px; overflow-y:auto;">&lt;Klicke unten auf 'Developer-Token holen'&gt;</code>
              </div>
            </div>

            <div>
              <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                <button id="btnFetchDevToken" class="btn-token" style="background:#0A58CA;" onclick="fetchBtpToken('devhub')">
                  <span>⚡ 1. Developer-Token holen</span>
                </button>
                <button id="btnInvokeDev" class="btn-token" style="background:#0284C7;" onclick="invokeBtp('devhub')">
                  <span>🚀 2. Integration Cell testen (/demo)</span>
                </button>
              </div>

              <!-- Live Result Box -->
              <div id="btpDevResultBox" style="display:none; margin-top:12px; background:#0F172A; border:1px solid #334155; border-radius:6px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span id="btpDevStatusBadge" style="font-weight:700; font-size:0.8rem; color:#4ADE80;">✅ HTTP 200 OK</span>
                  <span id="btpDevDuration" style="font-size:0.72rem; color:#94A3B8;"></span>
                </div>
                <pre style="margin:0; padding:0; max-height:160px; overflow-y:auto;"><code id="btpDevCode" style="color:#A7F3D0; font-size:0.74rem;"></code></pre>
                <div id="btpDevExplanation" style="margin-top:8px; font-size:0.75rem; color:#93C5FD; border-top:1px solid #1E293B; padding-top:6px; line-height:1.4;"></div>
              </div>
            </div>
          </div>

          <!-- BEREICH 2: SERVICE KEY -->
          <div class="btp-card" style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:10px; padding:18px 20px; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                  <span style="display:inline-block; font-size:0.72rem; font-weight:700; color:#475569; background:#F1F5F9; padding:3px 8px; border-radius:4px; margin-bottom:4px;">
                    SERVICE BINDING (it-rt)
                  </span>
                  <h3 style="margin:0; font-size:1.05rem; color:#334155; display:flex; align-items:center; gap:6px;">
                    ⚙️ Bereich B: Service Key (Integration Runtime)
                  </h3>
                </div>
                <span id="btpSvcTokenBadge" class="token-status-badge">Kein Token</span>
              </div>
              <p style="font-size:0.82rem; color:#64748B; margin:0 0 12px 0; line-height:1.4;">
                Direktes Service Binding der <b>Process Integration Runtime (it-rt)</b>. Besitzt Plattform-Rechte, aber <i>keine</i> Produkt-Berechtigung im Developer Hub.
              </p>
              
              <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:8px 10px; font-size:0.75rem; font-family:monospace; margin-bottom:12px; color:#334155; line-height:1.4;">
                <div><b>Client ID:</b> sb-f581317a-f129-40a9-a0fb-cdf54f81e053!b711904|it-rt-872f920dtrial!b26655</div>
                <div><b>Grant Type:</b> client_credentials (XSUAA OAuth2)</div>
                <div><b>Ziel-Endpoint:</b> /demo (Integration Cell)</div>
              </div>

              <!-- WICHTIGER DIDAKTISCHER MERKSATZ -->
              <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:6px; padding:8px 10px; margin-bottom:12px; font-size:0.75rem; color:#92400E; line-height:1.4;">
                💡 <b>Wichtige Architektur-Erkenntnis:</b> Solange im SAP Developer Hub <b>kein Produkt</b> angelegt bzw. die API nicht an ein Produkt gebunden ist, funktioniert dieser generische Service Key <b>einwandfrei (HTTP 200 OK)</b>! Erst sobald ein Produkt erzeugt und abonniert wird, erzwingt die Integration Cell die produktgebundene App-Subskription und verweigert den Service Key mit <b>HTTP 403 Forbidden</b>.
              </div>

              <!-- Token Display -->
              <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:0.75rem; font-weight:600; color:#475569;">Bearer Access Token:</span>
                  <button class="copy-btn" onclick="copyBtpToken('servicekey', this)">Kopieren</button>
                </div>
                <code id="btpSvcTokenDisplay" style="display:block; font-size:0.73rem; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:6px; padding:6px 10px; color:#1E293B; word-break:break-all; max-height:45px; overflow-y:auto;">&lt;Klicke unten auf 'Service-Token holen'&gt;</code>
              </div>
            </div>

            <div>
              <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                <button id="btnFetchSvcToken" class="btn-token" style="background:#475569;" onclick="fetchBtpToken('servicekey')">
                  <span>⚡ 1. Service-Token holen</span>
                </button>
                <button id="btnInvokeSvc" class="btn-token" style="background:#64748B;" onclick="invokeBtp('servicekey')">
                  <span>🚀 2. Integration Cell testen (/demo)</span>
                </button>
              </div>

              <!-- Live Result Box -->
              <div id="btpSvcResultBox" style="display:none; margin-top:12px; background:#0F172A; border:1px solid #334155; border-radius:6px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span id="btpSvcStatusBadge" style="font-weight:700; font-size:0.8rem; color:#F87171;">❌ HTTP 403 Forbidden</span>
                  <span id="btpSvcDuration" style="font-size:0.72rem; color:#94A3B8;"></span>
                </div>
                <pre style="margin:0; padding:0; max-height:160px; overflow-y:auto;"><code id="btpSvcCode" style="color:#FECACA; font-size:0.74rem;"></code></pre>
                <div id="btpSvcExplanation" style="margin-top:8px; font-size:0.75rem; color:#FCA5A5; border-top:1px solid #1E293B; padding-top:6px; line-height:1.4;"></div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 3: KRITIS & AUDIT LIVE-MONITOR (BACKEND-PERSPEKTIVE) -->
      <!-- ======================================================== -->
      <div class="audit-section-container" style="margin-top:35px; padding-top:24px; border-top:2px dashed #CBD5E1;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 style="font-size:1.3rem; color:#0A3D62; margin:0 0 6px 0; display:flex; align-items:center; gap:8px;">
              <span>🛡️ 3. Backend Audit & Access Log (KRITIS / NIS-2 Nachweis)</span>
            </h2>
            <p style="margin:0; font-size:0.88rem; color:#475569; line-height:1.5;">
              Hier siehst du in <b>Echtzeit</b> jeden einzelnen Aufruf, der bei diesem Backend über die <b>SAP BTP Destination (BTC_UTILITY_MOCK_API)</b> 
              oder den Inbound-Proxy eingegangen ist – inklusive <b>Client-ID</b>, <b>Auth-Methode</b>, <b>HTTP-Methode</b> und <b>Zeitstempel</b>.
            </p>
          </div>
          <button class="btn-token" style="background:#0284C7; font-size:0.8rem; padding:8px 14px;" onclick="refreshAuditLogs()">
            <span>🔄 Logs aktualisieren</span>
          </button>
        </div>

        <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
              <thead>
                <tr style="background:#F8FAFC; border-bottom:1px solid #E2E8F0; color:#475569;">
                  <th style="padding:10px 14px;">Zeitpunkt</th>
                  <th style="padding:10px 14px;">Status</th>
                  <th style="padding:10px 14px;">Aufrufer / Client ID</th>
                  <th style="padding:10px 14px;">Auth-Methode & Token-Quelle</th>
                  <th style="padding:10px 14px;">Pfad & Methode</th>
                  <th style="padding:10px 14px;">User-Agent</th>
                </tr>
              </thead>
              <tbody id="auditTableBody">
                <tr>
                  <td colspan="6" style="padding:18px 14px; text-align:center; color:#64748B;">
                    ⏳ Noch keine Aufrufe protokolliert. Löse einen Aufruf über die Integration Suite oder die Testbuttons aus!
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="background:#F1F5F9; border-top:1px solid #E2E8F0; padding:8px 14px; font-size:0.75rem; color:#64748B; display:flex; justify-content:space-between; align-items:center;">
            <span id="auditTotalText">Gesamt: 0 protokollierte Events</span>
            <span>💡 Manipulationssichere Protokollierung für BSI C5 & NIS-2 Audits</span>
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    let currentLiveToken = "";
    const btpTokens = { devhub: "", servicekey: "" };
    const btpTimers = { devhub: null, servicekey: null };

    async function fetchBtpToken(type) {
      const isDev = type === 'devhub';
      const btn = document.getElementById(isDev ? 'btnFetchDevToken' : 'btnFetchSvcToken');
      const badge = document.getElementById(isDev ? 'btpDevTokenBadge' : 'btpSvcTokenBadge');
      const display = document.getElementById(isDev ? 'btpDevTokenDisplay' : 'btpSvcTokenDisplay');
      
      if (btn) {
        btn.classList.add('loading');
        btn.innerHTML = '<span>⏳ XSUAA abfragen...</span>';
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
            btn.innerHTML = '<span>✓ Token aktiv!</span>';
            setTimeout(() => { 
              btn.innerHTML = isDev ? '<span>🔄 Developer-Token erneuern</span>' : '<span>🔄 Service-Token erneuern</span>'; 
            }, 2000);
          }

          if (isDev) {
            updateApimCurlWithBtpToken(data.access_token);
          }
        } else {
          if (display) display.innerText = 'Fehler: ' + JSON.stringify(data);
          if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = isDev ? '<span>⚡ 1. Developer-Token holen</span>' : '<span>⚡ 1. Service-Token holen</span>';
          }
        }
      } catch (err) {
        if (display) display.innerText = 'Netzwerkfehler: ' + err.message;
        if (btn) {
          btn.classList.remove('loading');
          btn.innerHTML = isDev ? '<span>⚡ 1. Developer-Token holen</span>' : '<span>⚡ 1. Service-Token holen</span>';
        }
      }
    }

    function copyToClipboard(text, btn) {
      if (!text) {
        alert("Bitte hole zuerst über den Button ein Token!");
        return;
      }
      const originalText = btn.innerText;
      const markSuccess = () => {
        btn.innerText = "✓ Kopiert!";
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(markSuccess).catch(() => {
          fallbackCopy(text, markSuccess);
        });
      } else {
        fallbackCopy(text, markSuccess);
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

    function copyBtpToken(type, btn) {
      const token = btpTokens[type];
      copyToClipboard(token, btn);
    }

    async function invokeBtp(type) {
      const isDev = type === 'devhub';
      const resultBox = document.getElementById(isDev ? 'btpDevResultBox' : 'btpSvcResultBox');
      const statusBadge = document.getElementById(isDev ? 'btpDevStatusBadge' : 'btpSvcStatusBadge');
      const durationSpan = document.getElementById(isDev ? 'btpDevDuration' : 'btpSvcDuration');
      const codeEl = document.getElementById(isDev ? 'btpDevCode' : 'btpSvcCode');
      const explanation = document.getElementById(isDev ? 'btpDevExplanation' : 'btpSvcExplanation');
      const btn = document.getElementById(isDev ? 'btnInvokeDev' : 'btnInvokeSvc');

      resultBox.style.display = 'block';
      statusBadge.style.color = '#38BDF8';
      statusBadge.innerText = '⏳ Rufe Integration Cell (/demo) auf...';
      durationSpan.innerText = '';
      codeEl.innerText = 'Verbinde mit Istio Envoy Gateway und K8s Worker-Pod...';
      explanation.innerText = '';

      if (btn) btn.classList.add('loading');

      try {
        const res = await fetch('/api/btp/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyType: type, token: btpTokens[type] || undefined })
        });
        const data = await res.json();
        
        if (btn) btn.classList.remove('loading');

        if (data.status === 200) {
          statusBadge.style.color = '#4ADE80';
          statusBadge.innerText = '✅ HTTP ' + data.status + ' OK · Server: ' + (data.server || 'istio-envoy');
          durationSpan.innerText = 'Dauer: ' + data.durationMs + ' ms · Artefakt: ' + (data.artifactType || 'api');
          codeEl.innerText = JSON.stringify(data.data, null, 2);
          explanation.innerHTML = '💡 <b>Erfolg:</b> Der API-Proxy auf der Integration Cell hat das Token verifiziert. Die Client-ID ist über den <b>Developer Hub</b> an das API-Produkt gebunden. Die Zählerdaten des Backends wurden erfolgreich geliefert!';
        } else if (data.status === 403) {
          statusBadge.style.color = '#F87171';
          statusBadge.innerText = '❌ HTTP ' + data.status + ' ' + (data.statusText || 'Forbidden') + ' · Server: ' + (data.server || 'istio-envoy');
          durationSpan.innerText = 'Dauer: ' + data.durationMs + ' ms';
          codeEl.innerText = JSON.stringify(data.data, null, 2);
          explanation.innerHTML = '💡 <b>Didaktischer Aha-Effekt:</b> Das Bearer-Token wurde von XSUAA fehlerfrei ausgestellt. Doch die Integration Cell lehnt den Aufruf mit <b>403 Forbidden</b> ab (<i>User does not have the authorization</i>), weil dem generic Service Key der Runtime die Produkt-Subskription aus dem Developer Hub fehlt!<br/><br/>💡 <b>Wichtige Architektur-Erkenntnis:</b> Hättest du im SAP Developer Hub <i>kein</i> Produkt angelegt (bzw. die API nicht an ein Produkt gebunden), würde dieser generische Service Key einwandfrei mit <b>HTTP 200 OK</b> durchgehen! Erst sobald ein Produkt erzeugt und abonniert wird, erzwingt die Integration Cell die strikte produktgebundene Zugriffskontrolle.';
        } else {
          statusBadge.style.color = '#F87171';
          statusBadge.innerText = '❌ HTTP ' + (data.status || '500') + ' ' + (data.statusText || 'Error');
          durationSpan.innerText = data.durationMs ? ('Dauer: ' + data.durationMs + ' ms') : '';
          codeEl.innerText = JSON.stringify(data.data || data, null, 2);
          explanation.innerHTML = '⚠️ Die Integration Cell hat einen Fehler gemeldet.';
        }
      } catch (err) {
        if (btn) btn.classList.remove('loading');
        statusBadge.style.color = '#F87171';
        statusBadge.innerText = '❌ Verbindungsfehler';
        codeEl.innerText = err.message;
        explanation.innerText = '';
      }
    }

    // ========================================================
    // NATIVE MOCK API LIVE-TESTS (OHNE TERMINAL / cURL)
    // ========================================================
    const MOCK_PROTOCOLS = {
      'rest': {
        name: 'REST API (OpenAPI 3.0)',
        method: 'GET',
        url: '/api/v1/smartmeters',
        headers: { 'Accept': 'application/json' },
        explanation: '💡 <b>REST-Aufruf erfolgreich:</b> Das Mock-Backend hat das Bearer-Token autorisiert und liefert die 4 Zähler-Datensätze als JSON nach OpenAPI 3.0 Spezifikation.'
      },
      'odata-v2': {
        name: 'SAP OData v2 Service',
        method: 'GET',
        url: '/odata/v2/utility/MeterReadingSet',
        headers: { 'Accept': 'application/json' },
        explanation: '💡 <b>OData v2 Aufruf erfolgreich:</b> Der native IS-U Utility Service antwortet im standardisierten OData v2 JSON-Format (EntitySet <code>MeterReadingSet</code>).'
      },
      'odata-v4': {
        name: 'SAP OData v4 Service',
        method: 'GET',
        url: '/odata/v4/utility/MeterReadings',
        headers: { 'Accept': 'application/json' },
        explanation: '💡 <b>OData v4 Aufruf erfolgreich:</b> Moderner RAP/CAP Service mit flachem OASIS OData v4 JSON (inkl. <code>@odata.context</code> und <code>value</code>).'
      },
      'soap': {
        name: 'Legacy SOAP 1.1 Web Service',
        method: 'POST',
        url: '/soap/utility',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://btc.de/energy/metering/soap/GetMeterReading'
        },
        body: '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:btc="http://btc.de/energy/metering/soap">\\n   <soapenv:Header/>\\n   <soapenv:Body>\\n      <btc:GetMeterReadingRequest>\\n         <btc:MeterId>DE-OL-MTR-002</btc:MeterId>\\n      </btc:GetMeterReadingRequest>\\n   </soapenv:Body>\\n</soapenv:Envelope>',
        explanation: '💡 <b>SOAP 1.1 Aufruf erfolgreich:</b> Der XML-Webservice hat den SOAP-Envelope und die SOAPAction verarbeitet und liefert valides SOAP-Response XML zurück.'
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

      resultBox.style.display = 'block';
      statusBadge.style.color = '#38BDF8';
      statusBadge.innerText = '⏳ Sende nativen Request...';
      endpointSpan.innerText = config.method + ' ' + config.url;
      durationSpan.innerText = '';
      codeEl.innerText = 'Rufe Mock-Backend direkt im Browser auf...';
      explanation.innerText = '';

      if (btn) btn.classList.add('loading');

      try {
        if (!currentLiveToken) {
          statusBadge.innerText = '⏳ Hole zuerst Provider-Token...';
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
          statusBadge.style.color = '#4ADE80';
          statusBadge.innerText = '✅ HTTP ' + res.status + ' ' + (res.statusText || 'OK');
          durationSpan.innerText = 'Dauer: ' + durationMs + ' ms';
          codeEl.innerText = displayData;
          explanation.innerHTML = config.explanation;
        } else {
          statusBadge.style.color = '#F87171';
          statusBadge.innerText = '❌ HTTP ' + res.status + ' ' + (res.statusText || 'Error');
          durationSpan.innerText = 'Dauer: ' + durationMs + ' ms';
          codeEl.innerText = displayData;
          explanation.innerHTML = '⚠️ Das Mock-Backend meldete einen Fehler: Bitte überprüfe das Bearer-Token.';
        }
      } catch (err) {
        if (btn) btn.classList.remove('loading');
        statusBadge.style.color = '#F87171';
        statusBadge.innerText = '❌ Verbindungsfehler';
        codeEl.innerText = err.message;
        explanation.innerText = '';
      }

      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function updateApimCurlWithBtpToken(token) {
      const ids = ['apimCurlRest', 'apimCurlODataV2All', 'apimCurlODataV2Filter', 'apimCurlODataV4All', 'apimCurlSoap'];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.innerText = el.innerText
            .replace(/Bearer\s+[a-zA-Z0-9_.-]+/g, 'Bearer ' + token)
            .replace(/-H\s+"apikey:[^"]*"/g, '-H "Authorization: Bearer ' + token + '"');
        }
      });
    }

    async function fetchLiveToken() {
      const liveBtns = [document.getElementById('btnFetchToken'), document.getElementById('btnFetchTokenRest')].filter(Boolean);
      const badge = document.getElementById('tokenBadge');
      const display = document.getElementById('tokenDisplay');
      
      liveBtns.forEach(b => {
        b.classList.add('loading');
        b.innerHTML = '<span>⏳ Token wird geholt...</span>';
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
            b.innerHTML = '<span>✓ Neuer Token erteilt!</span>';
            setTimeout(() => { b.innerHTML = '<span>🔄 Token neu erzeugen</span>'; }, 2000);
          });

          // Automatisch in alle cURL Blöcke einsetzen!
          updateAllCurlTokens(currentLiveToken);
        } else {
          if (display) display.innerText = "Fehler: " + JSON.stringify(data);
          liveBtns.forEach(b => {
            b.classList.remove('loading');
            b.innerHTML = '<span>⚡ Backend Mock Token holen</span>';
          });
        }
      } catch (e) {
        if (display) display.innerText = "Netzwerkfehler: " + e.message;
        liveBtns.forEach(b => {
          b.classList.remove('loading');
          b.innerHTML = '<span>⚡ Backend Mock Token holen</span>';
        });
      }
    }

    function updateAllCurlTokens(token) {
      const ids = ['curlRestReading', 'curlODataV2All', 'curlODataV2Filter', 'curlODataV4All', 'curlSoap'];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.innerText = el.innerText
            .replace(/Bearer\\s+<BITTE_OBEN_TOKEN_HOLEN>/g, 'Bearer ' + token)
            .replace(/Bearer\\s+[a-zA-Z0-9_.-]+/g, 'Bearer ' + token);
        }
      });
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

    // ========================================================
    // AUDIT LOG LIVE REFRESH
    // ========================================================
    async function refreshAuditLogs() {
      const tbody = document.getElementById('auditTableBody');
      const totalText = document.getElementById('auditTotalText');
      if (!tbody) return;

      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        const logs = data.logs || [];

        if (totalText) {
          totalText.innerText = 'Gesamt: ' + logs.length + ' protokollierte Events · Zuletzt aktualisiert: ' + new Date().toLocaleTimeString();
        }

        if (logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="padding:18px 14px; text-align:center; color:#64748B;">⏳ Noch keine Aufrufe protokolliert. Löse einen Aufruf über die Integration Suite oder die Testbuttons aus!</td></tr>';
          return;
        }

        tbody.innerHTML = logs.map(l => {
          const isSuccess = l.status >= 200 && l.status < 300;
          const statusBadge = isSuccess 
            ? '<span style="color:#166534; background:#DCFCE7; padding:2px 7px; border-radius:4px; font-weight:700;">' + l.status + ' OK</span>'
            : '<span style="color:#991B1B; background:#FEE2E2; padding:2px 7px; border-radius:4px; font-weight:700;">' + l.status + ' Denied</span>';
          
          const timeStr = new Date(l.timestamp).toLocaleTimeString();
          
          return '<tr style="border-bottom:1px solid #F1F5F9;">' +
            '<td style="padding:8px 14px; font-family:monospace; color:#475569;">' + timeStr + '</td>' +
            '<td style="padding:8px 14px;">' + statusBadge + '</td>' +
            '<td style="padding:8px 14px; font-weight:600; color:#0A3D62;">' + (l.client || 'Unknown') + '</td>' +
            '<td style="padding:8px 14px; font-size:0.75rem; color:#0369A1;">' + (l.authMethod || 'Bearer') + '<br/><span style="color:#64748B; font-family:monospace;">' + (l.tokenPreview || '') + '</span></td>' +
            '<td style="padding:8px 14px; font-family:monospace;"><span style="color:#0284C7; font-weight:700;">' + l.method + '</span> ' + l.path + '</td>' +
            '<td style="padding:8px 14px; font-size:0.72rem; color:#64748B; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (l.userAgent || 'Unknown') + '</td>' +
          '</tr>';
        }).join('');
      } catch (err) {
        console.error('Fehler beim Laden der Audit-Logs:', err);
      }
    }

    // Beim Laden und alle 5 Sekunden automatisch aktualisieren
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
