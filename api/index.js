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

// OData v2 Service Root
app.get('/odata/v2/utility/', (req, res) => {
  const base = getBaseUrl(req) + '/odata/v2/utility/';
  res.setHeader('Content-Type', 'application/json');
  res.json({
    d: {
      EntitySets: ["MeterReadingSet", "CustomerContractSet"]
    }
  });
});

// OData v2 $metadata XML (Klassischer EDMX-Standard, den APIM für Auto-Proxy nutzt!)
app.get(['/odata/v2/utility/$metadata', '/odata/v2/utility/\\$metadata'], (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(`<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData">
  <edmx:DataServices m:DataServiceVersion="2.0">
    <Schema Namespace="BTC_UTILITY_ISU_SRV" xml:lang="de" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="MeterReading" sap:content-version="1">
        <Key>
          <PropertyRef Name="MeterId" />
        </Key>
        <Property Name="MeterId" Type="Edm.String" Nullable="false" MaxLength="20" sap:label="Zählernummer" />
        <Property Name="Customer" Type="Edm.String" MaxLength="60" sap:label="Kunde / Anschlussnehmer" />
        <Property Name="ReadingKWh" Type="Edm.Decimal" Precision="12" Scale="3" Nullable="false" sap:label="Zählerstand kWh" />
        <Property Name="Tariff" Type="Edm.String" MaxLength="40" sap:label="Tarifbezeichnung" />
        <Property Name="Status" Type="Edm.String" MaxLength="10" sap:label="Status" />
      </EntityType>
      <EntityContainer Name="BTC_UTILITY_ISU_Entities" m:IsDefaultEntityContainer="true">
        <EntitySet Name="MeterReadingSet" EntityType="BTC_UTILITY_ISU_SRV.MeterReading" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:pageable="true" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`);
});

// OData v2 EntitySet
app.get('/odata/v2/utility/MeterReadingSet', (req, res) => {
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

// OData v2 Single Entity
app.get('/odata/v2/utility/MeterReadingSet\\(\':id\'\\)', (req, res) => {
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

// OData v4 Service Root
app.get('/odata/v4/utility/', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    "@odata.context": "$metadata",
    "value": [
      { "name": "MeterReadings", "kind": "EntitySet", "url": "MeterReadings" }
    ]
  });
});

// OData v4 $metadata XML (OASIS OData v4 EDMX Standard)
app.get(['/odata/v4/utility/$metadata', '/odata/v4/utility/\\$metadata'], (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(`<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="com.sap.btc.utility" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="MeterReading">
        <Key>
          <PropertyRef Name="meterId" />
        </Key>
        <Property Name="meterId" Type="Edm.String" Nullable="false" MaxLength="20" />
        <Property Name="customer" Type="Edm.String" MaxLength="60" />
        <Property Name="readingKWh" Type="Edm.Decimal" Precision="12" Scale="3" Nullable="false" />
        <Property Name="tariff" Type="Edm.String" MaxLength="40" />
        <Property Name="status" Type="Edm.String" MaxLength="10" />
      </EntityType>
      <EntityContainer Name="UtilityService">
        <EntitySet Name="MeterReadings" EntityType="com.sap.btc.utility.MeterReading" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`);
});

// OData v4 EntitySet (Flache JSON Struktur nach v4 Spezifikation)
app.get('/odata/v4/utility/MeterReadings', (req, res) => {
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

// WSDL Download (Web Services Description Language)
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

// SOAP Inbound Processing (Verarbeitet <soapenv:Envelope> und liefert XML Response)
app.post('/soap/utility', (req, res) => {
  const xmlBody = typeof req.body === 'string' ? req.body : '';
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');

  // Einfaches Extrahieren der MeterId aus dem SOAP Body
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
    
    /* Credentials Bar */
    .cred-bar {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      margin-bottom: 30px;
    }
    .cred-item h5 { margin: 0 0 4px 0; color: #64748B; font-size: 0.75rem; text-transform: uppercase; }
    .cred-item code { font-size: 0.95rem; font-weight: bold; color: #0F172A; }

    /* Developer Key Input */
    .devkey-container {
      background: #F0FDF4;
      border: 2px solid #86EFAC;
      border-radius: 8px;
      padding: 14px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .devkey-container label { font-size: 0.85rem; font-weight: bold; color: #166534; }
    .devkey-container input {
      flex: 1;
      min-width: 250px;
      padding: 8px 12px;
      border: 1px solid #86EFAC;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.9rem;
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

      <!-- OAUTH2 GLOBAL CREDENTIALS -->
      <div class="cred-bar">
        <div class="cred-item">
          <h5>OAuth2 Client ID</h5>
          <code>btc-demo-client</code>
        </div>
        <div class="cred-item">
          <h5>OAuth2 Client Secret</h5>
          <code>btc-demo-secret-2026</code>
        </div>
        <div class="cred-item">
          <h5>OAuth2 Token URL</h5>
          <code>${hostUrl}/oauth/token</code>
        </div>
        <div class="cred-item">
          <h5>Token Lebensdauer</h5>
          <code>300s (5 Min.)</code>
        </div>
      </div>

      <!-- PERSONALISIERTER DEVELOPER KEY -->
      <div class="devkey-container">
        <label for="devKeyInput">🔑 Dein Developer Key (aus dem SAP Developer Hub):</label>
        <input type="text" id="devKeyInput" placeholder="Hier deinen Developer Key einfügen..." oninput="updateDevKey(this.value)" />
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 1: REST & OAUTH 2.0 -->
      <!-- ======================================================== -->
      <div id="section-rest" class="protocol-section">
        <div class="note">
          <b>Schnittstelle 1: REST mit OpenAPI 3.0.3</b><br/>
          Inklusive interaktiver Swagger UI und echtem Token-Refresh. Ideal für das Durchstich-Szenario auf der Integration Cell!
          <div style="margin-top: 8px;">
            <a href="/docs" target="_blank" class="btn-link">📖 Swagger UI öffnen</a>
            <a href="/openapi.json" target="_blank" class="btn-link" style="background:#0F172A;">📜 OpenAPI 3.0 Spezifikation</a>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('rest', 'curl')">💻 cURL Befehle</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'destination')">☁️ BTP Destination</button>
          <button class="tab-btn" onclick="switchInnerTab('rest', 'policy')">🛡️ Ingress Developer Key Policy</button>
        </div>

        <div id="rest-curl" class="tab-pane active">
          <h3>1. Token holen (OAuth2 Client Credentials)</h3>
          <div class="code-box">
            <div class="code-box-header"><span>POST ${hostUrl}/oauth/token</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>curl -L -X POST "${hostUrl}/oauth/token" \\
     -H "Content-Type: application/x-www-form-urlencoded" \\
     -d "grant_type=client_credentials&client_id=btc-demo-client&client_secret=btc-demo-secret-2026"</code></pre>
          </div>

          <h3>2. Zählerdaten abrufen (GET /api/v1/smartmeters)</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET ${hostUrl}/api/v1/smartmeters</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>curl -L -X GET "${hostUrl}/api/v1/smartmeters" \\
     -H "Authorization: Bearer &lt;ACCESS_TOKEN&gt;"</code></pre>
          </div>

          <h3>3. Integration Cell Aufruf mit Developer Key</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET Cell Ingress</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code class="cell-curl">curl -L -X GET "https://&lt;DEINE_INTEGRATION_CELL_RUNTIME_URL&gt;/api/v1/smartmeters" \\
     -H "apikey: DEIN_DEVELOPER_KEY"</code></pre>
          </div>
        </div>

        <div id="rest-destination" class="tab-pane">
          <div class="code-box">
            <div class="code-box-header"><span>BTP Destination Properties</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>Name = BTC_SMARTMETER_REST_OAUTH
Type = HTTP
URL = ${hostUrl}/api/v1/
ProxyType = Internet
Authentication = OAuth2ClientCredentials
tokenServiceURL = ${hostUrl}/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026
IntegrationCell.Include = true</code></pre>
          </div>
        </div>

        <div id="rest-policy" class="tab-pane">
          <div class="code-box">
            <div class="code-box-header"><span>Policy: Authorization_ValidateDevHub.xml</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>&lt;Authorization async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt"&gt;
    &lt;VerificationPolicy&gt;
        &lt;Type&gt;APIKey&lt;/Type&gt;
        &lt;Source&gt;request.header.apikey&lt;/Source&gt;
    &lt;/VerificationPolicy&gt;
&lt;/Authorization&gt;</code></pre>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 2: SAP ODATA V2 -->
      <!-- ======================================================== -->
      <div id="section-odata-v2" class="protocol-section" style="display:none;">
        <div class="note">
          <b>Schnittstelle 2: SAP OData v2 Service (IS-U Utility Readings)</b><br/>
          Besitzt eine voll kompatible <code>$metadata</code> XML. Wenn du diese URL im SAP API Portal beim Anlegen eines API Proxies als <b>Service URL</b> einträgst, generiert APIM <b>vollautomatisch alle Ressourcen und die Swagger UI!</b>
          <div style="margin-top: 8px;">
            <a href="/odata/v2/utility/$metadata" target="_blank" class="btn-link" style="background:#107E3E;">📜 $metadata XML ansehen</a>
            <a href="/odata/v2/utility/MeterReadingSet" target="_blank" class="btn-link">📊 MeterReadingSet (JSON)</a>
          </div>
        </div>

        <div class="tabs-header">
          <button class="tab-btn active" onclick="switchInnerTab('odata-v2', 'proxy')">🚀 Proxy-Erstellung im APIM</button>
          <button class="tab-btn" onclick="switchInnerTab('odata-v2', 'curl')">💻 cURL Aufrufe</button>
        </div>

        <div id="odata-v2-proxy" class="tab-pane active">
          <h3>Im SAP API Portal / Integration Suite:</h3>
          <ol style="line-height:1.7; font-size:0.95rem;">
            <li>Wähle <b>Create API Proxy</b>.</li>
            <li>Source: Wähle <b>URL</b>.</li>
            <li>URL: Trage ein: <code>${hostUrl}/odata/v2/utility/</code></li>
            <li>Klicke auf <b>Next</b> ➔ APIM liest automatisch die <code>$metadata</code> und generiert die Entität <b>MeterReadingSet</b> mit allen CRUD-Operationen!</li>
          </ol>
        </div>

        <div id="odata-v2-curl" class="tab-pane">
          <h3>Alle Zählerstände abrufen</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET /odata/v2/utility/MeterReadingSet</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>curl -L -X GET "${hostUrl}/odata/v2/utility/MeterReadingSet" \\
     -H "Accept: application/json"</code></pre>
          </div>

          <h3>Gefilterte Abfrage ($filter)</h3>
          <div class="code-box">
            <div class="code-box-header"><span>GET mit $filter</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
            <pre><code>curl -L -X GET "${hostUrl}/odata/v2/utility/MeterReadingSet?\$filter=MeterId eq 'DE-OL-MTR-001'" \\
     -H "Accept: application/json"</code></pre>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 3: SAP ODATA V4 -->
      <!-- ======================================================== -->
      <div id="section-odata-v4" class="protocol-section" style="display:none;">
        <div class="note">
          <b>Schnittstelle 3: SAP OData v4 Service (Modern RAP / CAP)</b><br/>
          Entspricht dem modernen OASIS OData v4 Standard mit flachen JSON-Paylodas (<code>@odata.context</code> und <code>value</code>).
          <div style="margin-top: 8px;">
            <a href="/odata/v4/utility/$metadata" target="_blank" class="btn-link" style="background:#6366F1;">📜 OData v4 $metadata XML</a>
            <a href="/odata/v4/utility/MeterReadings" target="_blank" class="btn-link">📊 MeterReadings (v4 JSON)</a>
          </div>
        </div>

        <h3>Zählerstände im OData v4 Format abrufen</h3>
        <div class="code-box">
          <div class="code-box-header"><span>GET /odata/v4/utility/MeterReadings</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
          <pre><code>curl -L -X GET "${hostUrl}/odata/v4/utility/MeterReadings" \\
     -H "Accept: application/json"</code></pre>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- BEREICH 4: SOAP 1.1 / WSDL -->
      <!-- ======================================================== -->
      <div id="section-soap" class="protocol-section" style="display:none;">
        <div class="note">
          <b>Schnittstelle 4: Legacy SOAP 1.1 Service</b><br/>
          Ein klassischer XML Web Service inklusive WSDL-Datei. Das Paradebeispiel für APIM-Demos: Hier demonstrierst du <code>XMLToJSON</code>, SOAP-Envelopes und Header-Mapping!
          <div style="margin-top: 8px;">
            <a href="/soap/utility?wsdl" target="_blank" class="btn-link" style="background:#E9730C;">📜 WSDL herunterladen / ansehen</a>
          </div>
        </div>

        <h3>SOAP Request mit XML-Payload (Postman / cURL)</h3>
        <div class="code-box">
          <div class="code-box-header"><span>POST ${hostUrl}/soap/utility</span><button class="copy-btn" onclick="copyCode(this)">Kopieren</button></div>
          <pre><code>curl -L -X POST "${hostUrl}/soap/utility" \\
     -H "Content-Type: text/xml; charset=utf-8" \\
     -H "SOAPAction: http://btc.de/energy/metering/soap/GetMeterReading" \\
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

    </div>
  </div>

  <script>
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

    function updateDevKey(val) {
      const key = val.trim() || 'DEIN_DEVELOPER_KEY';
      document.querySelectorAll('.cell-curl').forEach(el => {
        el.innerText = 'curl -L -X GET "https://<DEINE_INTEGRATION_CELL_RUNTIME_URL>/api/v1/smartmeters" \\\\\\n     -H "apikey: ' + key + '"';
      });
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
