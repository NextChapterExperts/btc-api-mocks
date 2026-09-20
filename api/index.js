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

// OAuth2 Auth Middleware
function authenticateOAuth(req, res, next) {
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
      --sap-blue: #0A3D62;
      --sap-accent: #0070F2;
      --sap-green: #107E3E;
      --sap-purple: #6366F1;
      --sap-orange: #E9730C;
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
      max-width: 1150px;
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
    
    /* Die 4 Schnittstellen Kacheln oben */
    .protocol-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-top: 24px;
    }
    .protocol-card {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .protocol-card:hover {
      background: rgba(255,255,255,0.25);
      transform: translateY(-2px);
    }
    .protocol-card.selected {
      background: white;
      color: var(--text-main);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-color: white;
    }
    .protocol-card.selected h3 { color: var(--sap-accent); }
    .protocol-card h3 { margin: 0 0 4px 0; font-size: 1.1rem; color: white; display: flex; align-items: center; justify-content: space-between; }
    .protocol-card .badge {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: bold;
      background: rgba(0,0,0,0.2);
    }
    .protocol-card.selected .badge { background: #E0F2FE; color: #0369A1; }
    .protocol-card p { margin: 0; font-size: 0.82rem; opacity: 0.85; }

    .body-content { padding: 30px; }
    
    /* Live Interactive Token Generator Bar */
    .token-generator-box {
      background: #F0F9FF;
      border: 2px solid #BAE6FD;
      border-radius: 10px;
      padding: 18px 24px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .token-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .token-header-row h4 { margin: 0; color: #0369A1; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
    .btn-token {
      background: #0070F2;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: bold;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s;
    }
    .btn-token:hover { background: #0056b3; }
    .btn-token.loading { opacity: 0.7; pointer-events: none; }
    .token-display-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background: white;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 8px 14px;
    }
    .token-display-row code {
      flex: 1;
      color: #0F172A;
      font-family: monospace;
      font-size: 0.9rem;
      word-break: break-all;
    }
    .token-status-badge {
      font-size: 0.75rem;
      font-weight: bold;
      padding: 3px 8px;
      border-radius: 4px;
      background: #E2E8F0;
      color: #475569;
    }
    .token-status-badge.active {
      background: #DCFCE7;
      color: #166534;
    }

    /* Interaktives APIM Live Test Cockpit (Grün) */
    .apim-cockpit-box {
      background: #F0FDF4;
      border: 2px solid #86EFAC;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .apim-cockpit-box h4 {
      margin: 0 0 12px 0;
      color: #166534;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .apim-cockpit-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
    }
    @media (max-width: 768px) {
      .apim-cockpit-grid { grid-template-columns: 1fr; }
    }
    .apim-field label {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      color: #166534;
      margin-bottom: 6px;
    }
    .apim-field input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #86EFAC;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
      background: white;
      color: #14532D;
    }
    .apim-field input:focus {
      outline: none;
      border-color: #16A34A;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
    }
    .apim-hint {
      font-size: 0.8rem;
      color: #15803D;
      margin-top: 10px;
      line-height: 1.4;
    }
    .note-purple {
      background: #F5F3FF;
      border-left-color: #8B5CF6;
      color: #4C1D95;
    }

    /* Tabs Header */
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

    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* Code Block */
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
    .btn-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #0070F2;
      color: white;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .btn-link:hover { background: #0056b3; }
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

      <!-- DER INTERAKTIVE TOKEN GENERATOR KNOPF -->
      <div class="token-generator-box">
        <div class="token-header-row">
          <h4>🔐 Live OAuth 2.0 Token Cockpit</h4>
          <button id="btnFetchToken" class="btn-token" onclick="fetchLiveToken()">
            <span>⚡ OAuth 2.0 Bearer Token holen</span>
          </button>
        </div>
        <div class="token-display-row">
          <span id="tokenBadge" class="token-status-badge">Kein Token</span>
          <code id="tokenDisplay">&lt;Klicke auf den blauen Knopf oben, um live einen echten Token anzufordern&gt;</code>
          <button class="copy-btn" onclick="copyLiveToken(this)">Token kopieren</button>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 1: REST & OAUTH 2.0 -->
      <!-- ======================================================== -->
      <div id="section-rest" class="protocol-section">
        <div class="note">
          <b>Schnittstelle 1: REST API (Smart Meter Ingestion)</b><br/>
          Standardisierte REST-Schnittstelle mit OpenAPI 3.0.3 Spezifikation und interaktiver Swagger UI.
          <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <a href="/docs" target="_blank" class="btn-link">📖 Swagger UI öffnen</a>
            <a href="/openapi.json" target="_blank" class="btn-link" style="background:#0F172A;">📜 OpenAPI 3.0 Spezifikation</a>
            <button class="btn-token" onclick="fetchLiveToken()">⚡ OAuth 2.0 Bearer Token holen</button>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('rest', 'direct')">🔌 1. Direkt-Test (Backend Mock)</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'dest')">⚙️ 2. BTP Destination & Setup</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'apim')">🛡️ 3. APIM Proxy Test (Mit Developer Key)</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'policy')">📜 4. APIM Policies (XML)</button>
        </div>

        <!-- TAB 1: Direkt Test -->
        <div id="rest-direct" class="tab-pane active">
          <p style="font-size:0.9rem; color:#475569;">
            <b>Vor der APIM-Implementierung:</b> Direkter Aufruf gegen das Mock-Backend. Hierfür wird der <b>OAuth 2.0 Bearer Token</b> benötigt (kein Developer Key).
          </p>
          <h3>1. Token abholen per Terminal (Client Credentials)</h3>
          <div class="code-box">
            <div class="code-box-header"><span>POST ${hostUrl}/oauth/token</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>curl -L -X POST "${hostUrl}/oauth/token" \\
     -H "Content-Type: application/x-www-form-urlencoded" \\
     -d "grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026"</code></pre>
          </div>

          <h3>2. Zählerdaten abrufen mit Bearer Token</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET /api/v1/smartmeters</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="curlRestReading">curl -L -X GET "${hostUrl}/api/v1/smartmeters" \\
     -H "Authorization: Bearer &lt;BITTE_OBEN_TOKEN_HOLEN&gt;"</code></pre>
          </div>
        </div>

        <!-- TAB 2: BTP Destination -->
        <div id="rest-dest" class="tab-pane">
          <div class="note note-purple">
            <b>Zentrale BTP Destination für SAP Integration Suite / Integration Cell:</b><br/>
            Lege diese Destination im BTP Subaccount an. Sie dient als SSoT für alle Proxies und API-Artefakte.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>BTP Destination: BTC_UTILITY_MOCK_API (OAuth2ClientCredentials)</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
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
          <ol style="line-height:1.7; font-size:0.92rem;">
            <li><b>API Proxy anlegen:</b> Wähle <i>Create API Proxy</i>.</li>
            <li><b>Source:</b> Wähle <i>OpenAPI</i> oder <i>URL</i> mit <code>${hostUrl}/api/v1/</code></li>
            <li><b>API-Artefakt (Integration Cell):</b> Referenziere Destination <code>BTC_UTILITY_MOCK_API</code> mit relativem Pfad <code>/api/v1/smartmeters</code>.</li>
          </ol>
        </div>

        <!-- TAB 3: APIM Proxy Test -->
        <div id="rest-apim" class="tab-pane">
          <div class="apim-cockpit-box">
            <h4>🛡️ APIM Proxy Test-Konfiguration</h4>
            <div class="apim-cockpit-grid">
              <div class="apim-field">
                <label for="apimHost_rest">🌐 Deine SAP APIM / Integration Cell Host-URL:</label>
                <input type="text" id="apimHost_rest" value="https://&lt;DEIN_APIM_HOST&gt;" oninput="syncApimInputs(this.value, null)" />
              </div>
              <div class="apim-field">
                <label for="apimKey_rest">🔑 Dein Developer Key (aus dem Hub):</label>
                <input type="text" id="apimKey_rest" value="DEIN_DEVELOPER_KEY" oninput="syncApimInputs(null, this.value)" />
              </div>
            </div>
            <div class="apim-hint">
              💡 <b>Didaktischer Merksatz:</b> Der Konsument ruft ausschließlich den APIM Proxy auf und authentifiziert sich per <code>apikey</code> (Developer Key). Das Backend sieht diesen Key nie – APIM tauscht ihn automatisch gegen den Backend-OAuth2-Token aus!
            </div>
          </div>

          <h3>Aufruf über den fertig implementierten APIM Proxy</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET über APIM Runtime</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="apimCurlRest">curl -L -X GET "https://&lt;DEIN_APIM_HOST&gt;/api/v1/smartmeters" \\
     -H "apikey: DEIN_DEVELOPER_KEY"</code></pre>
          </div>
        </div>

        <!-- TAB 4: Policy XML -->
        <div id="rest-policy" class="tab-pane">
          <div class="note">
            <b>Policy: Ingress Developer Key Validierung</b><br/>
            Füge diese Policy im <i>ProxyEndpoint PreFlow</i> ein, um den Developer Key aus dem Developer Hub zu erzwingen.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_DevHub.xml</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
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
          <b>Schnittstelle 2: SAP OData v2 Service (IS-U Utility Readings)</b><br/>
          • <b>Metadaten ($metadata):</b> Öffentlich abrufbar, damit APIM den Auto-Proxy bauen kann.<br/>
          • <b>Geschäftsdaten (MeterReadingSet):</b> Geschützt über den <b>OAuth 2.0 Bearer Token</b>!
          <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <a href="/odata/v2/utility/$metadata" target="_blank" class="btn-link" style="background:#107E3E;">📜 $metadata XML ansehen</a>
            <button class="btn-token" onclick="fetchLiveToken()">⚡ OAuth 2.0 Bearer Token holen</button>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('odata-v2', 'direct')">🔌 1. Direkt-Test (Backend Mock)</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'dest')">⚙️ 2. BTP Destination & Setup</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'apim')">🛡️ 3. APIM Proxy Test (Mit Developer Key)</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'policy')">📜 4. APIM Policies (XML)</button>
        </div>

        <!-- TAB 1: Direkt Test -->
        <div id="odata-v2-direct" class="tab-pane active">
          <p style="font-size:0.9rem; color:#475569;">
            <b>Direkter Backend-Test:</b> Abfrage direkt gegen Vercel mit OAuth 2.0 Bearer Token.
          </p>
          <h3>1. Alle Zählerstände abrufen</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET /odata/v2/utility/MeterReadingSet</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="curlODataV2All">curl -L -X GET "${hostUrl}/odata/v2/utility/MeterReadingSet" \\
     -H "Accept: application/json" \\
     -H "Authorization: Bearer &lt;BITTE_OBEN_TOKEN_HOLEN&gt;"</code></pre>
          </div>

          <h3>2. Gefilterte Abfrage ($filter) mit Bearer Token</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET mit $filter</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="curlODataV2Filter">curl -L -X GET "${hostUrl}/odata/v2/utility/MeterReadingSet?%24filter=MeterId%20eq%20%27DE-OL-MTR-001%27" \\
     -H "Accept: application/json" \\
     -H "Authorization: Bearer &lt;BITTE_OBEN_TOKEN_HOLEN&gt;"</code></pre>
          </div>
        </div>

        <!-- TAB 2: BTP Destination & Proxy Setup -->
        <div id="odata-v2-dest" class="tab-pane">
          <div class="note note-purple">
            <b>Auto-Proxy Generierung im API Portal:</b><br/>
            APIM liest die <code>$metadata</code> des OData v2 Services aus und erzeugt automatisch die CRUD-Ressourcen für die EntitySet <code>MeterReadingSet</code>.
          </div>
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
          <h4>Vorgehen im API Portal:</h4>
          <ol style="line-height:1.7; font-size:0.92rem;">
            <li>Wähle <b>Create API Proxy</b>.</li>
            <li>Source: Wähle <b>URL</b>.</li>
            <li>URL: <code>${hostUrl}/odata/v2/utility/</code></li>
            <li>APIM parst die EDMX Metadaten und baut den OData v2 Proxy vollautomatisch auf.</li>
          </ol>
        </div>

        <!-- TAB 3: APIM Proxy Test -->
        <div id="odata-v2-apim" class="tab-pane">
          <div class="apim-cockpit-box">
            <h4>🛡️ APIM Proxy Test-Konfiguration</h4>
            <div class="apim-cockpit-grid">
              <div class="apim-field">
                <label for="apimHost_odata-v2">🌐 Deine SAP APIM / Integration Cell Host-URL:</label>
                <input type="text" id="apimHost_odata-v2" value="https://&lt;DEIN_APIM_HOST&gt;" oninput="syncApimInputs(this.value, null)" />
              </div>
              <div class="apim-field">
                <label for="apimKey_odata-v2">🔑 Dein Developer Key (aus dem Hub):</label>
                <input type="text" id="apimKey_odata-v2" value="DEIN_DEVELOPER_KEY" oninput="syncApimInputs(null, this.value)" />
              </div>
            </div>
            <div class="apim-hint">
              💡 Der Aufruf erfolgt gegen deinen SAP APIM Proxy mit dem Developer Key im Header <code>apikey</code>.
            </div>
          </div>

          <h3>1. Alle Zählerstände über APIM abrufen</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET /odata/v2/utility/MeterReadingSet über APIM</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="apimCurlODataV2All">curl -L -X GET "https://&lt;DEIN_APIM_HOST&gt;/odata/v2/utility/MeterReadingSet" \\
     -H "Accept: application/json" \\
     -H "apikey: DEIN_DEVELOPER_KEY"</code></pre>
          </div>

          <h3>2. Gefilterte Abfrage ($filter) über APIM</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET mit $filter über APIM</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="apimCurlODataV2Filter">curl -L -X GET "https://&lt;DEIN_APIM_HOST&gt;/odata/v2/utility/MeterReadingSet?%24filter=MeterId%20eq%20%27DE-OL-MTR-001%27" \\
     -H "Accept: application/json" \\
     -H "apikey: DEIN_DEVELOPER_KEY"</code></pre>
          </div>
        </div>

        <!-- TAB 4: Policy XML -->
        <div id="odata-v2-policy" class="tab-pane">
          <div class="note">
            <b>VerifyAPIKey Policy für OData v2 Proxies</b><br/>
            Erzwingt einen gültigen Developer Key vor Weiterleitung an den SAP IS-U OData v2 Service.
          </div>
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_ODataV2.xml</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
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
          <b>Schnittstelle 3: SAP OData v4 Service (Modern RAP / CAP)</b><br/>
          Geschützt über <b>OAuth 2.0 Bearer Token</b>. Liefert flache JSON-Objekte nach OASIS-Standard.
          <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <a href="/odata/v4/utility/$metadata" target="_blank" class="btn-link" style="background:#6366F1;">📜 OData v4 $metadata XML</a>
            <button class="btn-token" onclick="fetchLiveToken()">⚡ OAuth 2.0 Bearer Token holen</button>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('odata-v4', 'direct')">🔌 1. Direkt-Test (Backend Mock)</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v4', 'dest')">⚙️ 2. BTP Destination & Setup</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v4', 'apim')">🛡️ 3. APIM Proxy Test (Mit Developer Key)</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v4', 'policy')">📜 4. APIM Policies (XML)</button>
        </div>

        <!-- TAB 1: Direkt Test -->
        <div id="odata-v4-direct" class="tab-pane active">
          <p style="font-size:0.9rem; color:#475569;">
            <b>Direkter Backend-Test:</b> OASIS OData v4 Format mit Bearer Token.
          </p>
          <h3>Zählerstände im OData v4 Format abrufen</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET /odata/v4/utility/MeterReadings</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="curlODataV4All">curl -L -X GET "${hostUrl}/odata/v4/utility/MeterReadings" \\
     -H "Accept: application/json" \\
     -H "Authorization: Bearer &lt;BITTE_OBEN_TOKEN_HOLEN&gt;"</code></pre>
          </div>
        </div>

        <!-- TAB 2: Destination & Setup -->
        <div id="odata-v4-dest" class="tab-pane">
          <div class="note note-purple">
            <b>BTP Destination & OData v4 Proxy Setup:</b><br/>
            Verwendet die identische Destination <code>BTC_UTILITY_MOCK_API</code>.
          </div>
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

        <!-- TAB 3: APIM Proxy Test -->
        <div id="odata-v4-apim" class="tab-pane">
          <div class="apim-cockpit-box">
            <h4>🛡️ APIM Proxy Test-Konfiguration</h4>
            <div class="apim-cockpit-grid">
              <div class="apim-field">
                <label for="apimHost_odata-v4">🌐 Deine SAP APIM / Integration Cell Host-URL:</label>
                <input type="text" id="apimHost_odata-v4" value="https://&lt;DEIN_APIM_HOST&gt;" oninput="syncApimInputs(this.value, null)" />
              </div>
              <div class="apim-field">
                <label for="apimKey_odata-v4">🔑 Dein Developer Key (aus dem Hub):</label>
                <input type="text" id="apimKey_odata-v4" value="DEIN_DEVELOPER_KEY" oninput="syncApimInputs(null, this.value)" />
              </div>
            </div>
            <div class="apim-hint">
              💡 OData v4 Abfrage über APIM mit Header <code>apikey</code>.
            </div>
          </div>

          <h3>OData v4 über APIM abrufen</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET /odata/v4/utility/MeterReadings über APIM</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="apimCurlODataV4All">curl -L -X GET "https://&lt;DEIN_APIM_HOST&gt;/odata/v4/utility/MeterReadings" \\
     -H "Accept: application/json" \\
     -H "apikey: DEIN_DEVELOPER_KEY"</code></pre>
          </div>
        </div>

        <!-- TAB 4: Policy XML -->
        <div id="odata-v4-policy" class="tab-pane">
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_ODataV4.xml</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
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
          <b>Schnittstelle 4: Legacy SOAP 1.1 Service</b><br/>
          Klassischer XML Web Service mit WSDL. Erfordert im direkten Aufruf den <b>OAuth 2.0 Bearer Token</b> im HTTP-Header.
          <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <a href="/soap/utility?wsdl" target="_blank" class="btn-link" style="background:#E9730C;">📜 WSDL herunterladen / ansehen</a>
            <button class="btn-token" onclick="fetchLiveToken()">⚡ OAuth 2.0 Bearer Token holen</button>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('soap', 'direct')">🔌 1. Direkt-Test (Backend Mock)</button>
          <button class="tab-btn" onclick="switchInnerTab('soap', 'dest')">⚙️ 2. BTP Destination & Setup</button>
          <button class="tab-btn" onclick="switchInnerTab('soap', 'apim')">🛡️ 3. APIM Proxy Test (Mit Developer Key)</button>
          <button class="tab-btn" onclick="switchInnerTab('soap', 'policy')">📜 4. APIM Policies (XML)</button>
        </div>

        <!-- TAB 1: Direkt Test -->
        <div id="soap-direct" class="tab-pane active">
          <p style="font-size:0.9rem; color:#475569;">
            <b>Direkter Backend-Test:</b> SOAP 1.1 Envelope mit Bearer Token.
          </p>
          <h3>SOAP Request mit XML-Payload & Bearer Token</h3>
          <div class="code-box">
            <div class="code-box-header"><span>POST ${hostUrl}/soap/utility</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="curlSoap">curl -L -X POST "${hostUrl}/soap/utility" \\
     -H "Content-Type: text/xml; charset=utf-8" \\
     -H "SOAPAction: http://btc.de/energy/metering/soap/GetMeterReading" \\
     -H "Authorization: Bearer &lt;BITTE_OBEN_TOKEN_HOLEN&gt;" \\
     -d '&lt;soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:btc="http://btc.de/energy/metering/soap"&gt;
   &lt;soapenv:Header/&gt;
   &lt;soapenv:Body&gt;
      &lt;btc:GetMeterReadingRequest&gt;
         &lt;btc:MeterId&gt;DE-OL-MTR-002&lt;/btc:MeterId&gt;
      &lt;/btc:GetMeterReadingRequest&gt;
   &lt;/soapenv:Body&gt;
&lt;/soapenv:Envelope&gt;'</code></pre>
          </div>
        </div>

        <!-- TAB 2: Destination & Setup -->
        <div id="soap-dest" class="tab-pane">
          <div class="note note-purple">
            <b>SOAP-to-REST oder Pass-Through im APIM:</b><br/>
            SOAP-Proxies können als Passthrough oder via XSLT / XML-to-JSON Policies im APIM transformiert werden.
          </div>
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
          <h4>Vorgehen für SOAP im API Portal:</h4>
          <ol style="line-height:1.7; font-size:0.92rem;">
            <li>Wähle <b>Create API Proxy</b>.</li>
            <li>Source: Wähle <b>WSDL</b> und gib ein: <code>${hostUrl}/soap/utility?wsdl</code></li>
            <li>Port & Operation: Wähle <code>MeterServiceSoapPort</code> ➔ generiert die Route für <code>GetMeterReading</code>.</li>
          </ol>
        </div>

        <!-- TAB 3: APIM Proxy Test -->
        <div id="soap-apim" class="tab-pane">
          <div class="apim-cockpit-box">
            <h4>🛡️ APIM Proxy Test-Konfiguration</h4>
            <div class="apim-cockpit-grid">
              <div class="apim-field">
                <label for="apimHost_soap">🌐 Deine SAP APIM / Integration Cell Host-URL:</label>
                <input type="text" id="apimHost_soap" value="https://&lt;DEIN_APIM_HOST&gt;" oninput="syncApimInputs(this.value, null)" />
              </div>
              <div class="apim-field">
                <label for="apimKey_soap">🔑 Dein Developer Key (aus dem Hub):</label>
                <input type="text" id="apimKey_soap" value="DEIN_DEVELOPER_KEY" oninput="syncApimInputs(null, this.value)" />
              </div>
            </div>
            <div class="apim-hint">
              💡 Der Konsument schickt den Developer Key im Header <code>apikey</code> an den APIM SOAP-Proxy.
            </div>
          </div>

          <h3>SOAP Call über APIM mit Developer Key</h3>
          <div class="code-box">
            <div class="code-box-header"><span>POST über APIM Runtime</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code id="apimCurlSoap">curl -L -X POST "https://&lt;DEIN_APIM_HOST&gt;/soap/utility" \\
     -H "Content-Type: text/xml; charset=utf-8" \\
     -H "SOAPAction: http://btc.de/energy/metering/soap/GetMeterReading" \\
     -H "apikey: DEIN_DEVELOPER_KEY" \\
     -d '&lt;soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:btc="http://btc.de/energy/metering/soap"&gt;
   &lt;soapenv:Header/&gt;
   &lt;soapenv:Body&gt;
      &lt;btc:GetMeterReadingRequest&gt;
         &lt;btc:MeterId&gt;DE-OL-MTR-002&lt;/btc:MeterId&gt;
      &lt;/btc:GetMeterReadingRequest&gt;
   &lt;/soapenv:Body&gt;
&lt;/soapenv:Envelope&gt;'</code></pre>
          </div>
        </div>

        <!-- TAB 4: Policy XML -->
        <div id="soap-policy" class="tab-pane">
          <div class="code-box">
            <div class="code-box-header"><span>Policy: VerifyAPIKey_SOAP.xml</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>&lt;VerifyAPIKey async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;APIKey ref="request.header.apikey"/&gt;
&lt;/VerifyAPIKey&gt;</code></pre>
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    let currentLiveToken = "";

    async function fetchLiveToken() {
      const btns = document.querySelectorAll('.btn-token');
      const badge = document.getElementById('tokenBadge');
      const display = document.getElementById('tokenDisplay');
      
      btns.forEach(b => {
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
          btns.forEach(b => {
            b.innerHTML = '<span>✓ Neuer Token erteilt!</span>';
            setTimeout(() => { b.innerHTML = '<span>🔄 Token neu erzeugen</span>'; b.classList.remove('loading'); }, 2000);
          });

          // Automatisch in alle cURL Blöcke einsetzen!
          updateAllCurlTokens(currentLiveToken);
        } else {
          if (display) display.innerText = "Fehler: " + JSON.stringify(data);
          btns.forEach(b => {
            b.classList.remove('loading');
            b.innerHTML = '<span>⚡ OAuth 2.0 Bearer Token holen</span>';
          });
        }
      } catch (e) {
        if (display) display.innerText = "Netzwerkfehler: " + e.message;
        btns.forEach(b => {
          b.classList.remove('loading');
          b.innerHTML = '<span>⚡ OAuth 2.0 Bearer Token holen</span>';
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
      if (!currentLiveToken) {
        alert("Bitte hole zuerst über den blauen Knopf einen Token!");
        return;
      }
      navigator.clipboard.writeText(currentLiveToken).then(() => {
        btn.innerText = "✓ Kopiert!";
        setTimeout(() => { btn.innerText = "Token kopieren"; }, 2000);
      });
    }

    function selectProtocol(protoId) {
      document.querySelectorAll('.protocol-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.protocol-section').forEach(s => s.style.display = 'none');
      
      const card = Array.from(document.querySelectorAll('.protocol-card')).find(c => c.getAttribute('onclick').includes(protoId));
      if (card) card.classList.add('selected');

      const sec = document.getElementById('section-' + protoId);
      if (sec) sec.style.display = 'block';
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
      navigator.clipboard.writeText(pre.innerText).then(() => {
        btn.innerText = "✓ Kopiert!";
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = "Kopieren";
          btn.classList.remove('copied');
        }, 2000);
      });
    }

    let globalApimHost = "https://<DEIN_APIM_HOST>";
    let globalApimKey = "DEIN_DEVELOPER_KEY";

    function syncApimInputs(hostVal, keyVal) {
      if (hostVal !== null && hostVal !== undefined) {
        globalApimHost = hostVal.trim() || 'https://<DEIN_APIM_HOST>';
        if (globalApimHost.endsWith('/')) {
          globalApimHost = globalApimHost.slice(0, -1);
        }
        ['rest', 'odata-v2', 'odata-v4', 'soap'].forEach(p => {
          const inp = document.getElementById('apimHost_' + p);
          if (inp && inp !== document.activeElement) inp.value = globalApimHost;
        });
      }

      if (keyVal !== null && keyVal !== undefined) {
        globalApimKey = keyVal.trim() || 'DEIN_DEVELOPER_KEY';
        ['rest', 'odata-v2', 'odata-v4', 'soap'].forEach(p => {
          const inp = document.getElementById('apimKey_' + p);
          if (inp && inp !== document.activeElement) inp.value = globalApimKey;
        });
      }

      updateApimCurlSnippets();
    }

    function updateApimCurlSnippets() {
      // 1. REST
      const rest = document.getElementById('apimCurlRest');
      if (rest) {
        rest.innerText = 'curl -L -X GET "' + globalApimHost + '/api/v1/smartmeters" \\\n     -H "apikey: ' + globalApimKey + '"';
      }

      // 2. OData v2 All
      const odataV2All = document.getElementById('apimCurlODataV2All');
      if (odataV2All) {
        odataV2All.innerText = 'curl -L -X GET "' + globalApimHost + '/odata/v2/utility/MeterReadingSet" \\\n     -H "Accept: application/json" \\\n     -H "apikey: ' + globalApimKey + '"';
      }

      // 3. OData v2 Filter
      const odataV2Filter = document.getElementById('apimCurlODataV2Filter');
      if (odataV2Filter) {
        odataV2Filter.innerText = 'curl -L -X GET "' + globalApimHost + '/odata/v2/utility/MeterReadingSet?%24filter=MeterId%20eq%20%27DE-OL-MTR-001%27" \\\n     -H "Accept: application/json" \\\n     -H "apikey: ' + globalApimKey + '"';
      }

      // 4. OData v4 All
      const odataV4All = document.getElementById('apimCurlODataV4All');
      if (odataV4All) {
        odataV4All.innerText = 'curl -L -X GET "' + globalApimHost + '/odata/v4/utility/MeterReadings" \\\n     -H "Accept: application/json" \\\n     -H "apikey: ' + globalApimKey + '"';
      }

      // 5. SOAP
      const soap = document.getElementById('apimCurlSoap');
      if (soap) {
        soap.innerText = soap.innerText
          .replace(/POST\s+"[^"]+"/g, 'POST "' + globalApimHost + '/soap/utility"')
          .replace(/-H\s+"apikey:[^"]*"/g, '-H "apikey: ' + globalApimKey + '"');
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
