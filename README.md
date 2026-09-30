# ⚡ BTC API Mocks (Next Chapter Experts)

> **Zweck:** Zentrale, öffentlich erreichbare Mock-APIs für Schulungen und Demos (SAP BTP Integration Suite, Integration Cell, API Management, MCP Gateway).  
> **Host:** Vercel Serverless (Dauerhaft online & kostenlos).

---

## 🧭 Enthaltene Schnittstellen

| Schnittstelle | Protokoll / Format | Authentifizierung | Status |
| :--- | :--- | :--- | :---: |
| **Smart Meter Energy Services** | REST (OpenAPI 3.0.3) | **OAuth 2.0 Client Credentials** (`/oauth/token`) & **API Key** | 🟢 Bereit |
| **SAP S/4HANA Business Partner** | OData v2 (`OP_API_BUSINESS_PARTNER_SRV`) | **Keine (Public / No Auth)** &ndash; Ideal für API-Proxy | 🟢 Bereit |
| **SAP Gateway Catalog Service** | OData v2 (`/IWFND/CATALOGSERVICE;v=2`) | **Keine (Public / No Auth)** &ndash; Automatische Service-Discovery | 🟢 Bereit |
| **IS-U Meter-to-Cash Service** | OData v2 / v4 (`$metadata`) | OAuth 2.0 Bearer | 🟢 Bereit |
| **Legacy Marktkommunikation** | SOAP / XML (WSDL 1.1) | OAuth 2.0 Bearer | 🟢 Bereit |

---

## ⚡ 1. Smart Meter Energy Services API (Live)

- 📖 **Interaktive Swagger UI:** [`/docs`](/docs)
- 📜 **OpenAPI 3.0.3 Spezifikation:** [`/openapi.json`](/openapi.json)
- 🔐 **Token & Refresh Endpoint:** `POST /oauth/token`
- 📊 **Zählerdaten Endpunkt:** `GET` & `POST` `/api/v1/smartmeters`

### 🔑 Vordefinierte Zugangsdaten

| Parameter | Wert | Beschreibung |
| :--- | :--- | :--- |
| **Client ID** | `btc-demo-client` | Für OAuth2 Client Credentials |
| **Client Secret** | `btc-demo-secret-2026` | Für OAuth2 Client Credentials |
| **Token URL** | `https://<deine-app>.vercel.app/oauth/token` | Token & Refresh Endpoint |
| **API Endpoint** | `https://<deine-app>.vercel.app/api/v1/smartmeters` | Zählerdaten (GET & POST) |
| **Target API Key** | `DEMO_SECRET_TARGET_KEY_987654321` | Für Direktanbindung ohne OAuth |
| **Token Gültigkeit** | `300 Sekunden` (5 Minuten) | Für die Vorführung von Caching & Refresh |

---

## ☁️ SAP BTP Destination Konfiguration (Properties)

```properties
Name = BTC_SMARTMETER_OAUTH
Type = HTTP
Description = BTC Smart Meter REST API mit OAuth2 Client Credentials
URL = https://<deine-app>.vercel.app/api/v1/
ProxyType = Internet
Authentication = OAuth2ClientCredentials
tokenServiceURL = https://<deine-app>.vercel.app/oauth/token
clientId = btc-demo-client
clientSecret = btc-demo-secret-2026

# ZWINGEND FÜR INTEGRATION CELL (Synchronisation in K8s Pod):
IntegrationCell.Include = true
```

---

## 👥 2. SAP S/4HANA Business Partner OData v2 API (Live & Public Mock)

- 📜 **Spezifikations-Basis:** `OP_API_BUSINESS_PARTNER_SRV` (SAP Business Accelerator Hub)
- 🌐 **Service Root (Ziel-URL für API Proxy):** `https://<deine-app>.vercel.app/sap/opu/odata/sap/API_BUSINESS_PARTNER`
- 📑 **Metadaten EDMX:** `GET /sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata`
- 🔓 **Authentifizierung:** **Keine (Public / No Auth)** &ndash; Ermöglicht die unkomplizierte Demonstration von SAP BTP API Proxies (Schutz über Policies wie *Verify API Key*, *Spike Arrest*, *Quota*, *Response Cache* etc.).

### Unterstützte EntitySets & Endpunkte

| EntitySet | URL-Pfad | Beschreibung |
| :--- | :--- | :--- |
| **Service Document** | `GET /sap/opu/odata/sap/API_BUSINESS_PARTNER/` | Katalog der EntitySets (JSON oder Atom/XML) |
| **$metadata** | `GET /sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata` | EDMX 1.0 Metadatenschema für den Import im APIM |
| **A_BusinessPartner** | `GET .../A_BusinessPartner?$top=5&$format=json` | Liste der Geschäftspartner (inkl. `$filter`, `$select`, `$top`) |
| **A_BusinessPartner (Key)** | `GET .../A_BusinessPartner('1000010')?$format=json` | Einzelsatz (z. B. BTC AG) |
| **Adressen-Navigation** | `GET .../A_BusinessPartner('1000010')/to_BusinessPartnerAddress` | Verknüpfte Post- und Standortadressen |
| **Debitoren-Navigation** | `GET .../A_BusinessPartner('1000010')/to_Customer` | Verknüpfter Debitor |
| **Kreditoren-Navigation** | `GET .../A_BusinessPartner('1000010')/to_Supplier` | Verknüpfter Kreditor |
| **A_Customer** | `GET .../A_Customer?$format=json` | Debitoren-Stammdaten |
| **A_Supplier** | `GET .../A_Supplier?$format=json` | Kreditoren-Stammdaten |
| **A_BusinessPartnerAddress** | `GET .../A_BusinessPartnerAddress?$format=json` | Alle Adressen |
| **A_BusinessPartnerRole** | `GET .../A_BusinessPartnerRole?$format=json` | Rollen (z. B. FLCU00, FLVN00) |
| **A_BusinessPartnerBank** | `GET .../A_BusinessPartnerBank?$format=json` | Bankverbindungen (IBANs) |

---

## 🗂️ 3. SAP Gateway Catalog Service (Automatisierte Service-Discovery im APIM)

Damit Sie im **SAP BTP API Management** einen klassischen **API Provider** anlegen können und SAP APIM beim Erstellen eines API-Proxys automatisch alle verfügbaren OData-Services findet, simuliert dieser Server den standardmäßigen SAP Gateway Catalog Service (`/IWFND/CATALOGSERVICE;v=2`).

### Einstellungen im SAP BTP API Provider Dialog
* **Provider Typ:** `SAP Gateway` oder `Internet`
* **Host:** `<deine-app>.vercel.app` (ohne https://)
* **Port:** `443`
* **Path Prefix:** `/sap/opu/odata` *(funktioniert auch mit `/sap/opu/odata/sap/` oder komplett leer)*
* **Service Collection URL:** `/IWFND/CATALOGSERVICE;v=2/ServiceCollection` *(akzeptiert auch `/ServiceCollection`, `/RecommendedServiceCollection` oder `/IWFND/CATALOGSERVICE/ServiceCollection`)*
* **Authentication:** `None`

### Automatische Kompatibilitätsfeatures
* **SAPUI5 Table Binding:** Unterstützt `$inlinecount=allpages` mit `__count` und `<m:count>` (verhindert leere Auswahllisten im APIM-Dialog).
* **Universelle Pfad-Toleranz:** Reagiert auf `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/...`, `/sap/opu/odata/ServiceCollection`, `/sap/opu/odata/sap/`, `/RecommendedServiceCollection` etc.
* **Service-Aliase:** Bietet sowohl `API_BUSINESS_PARTNER` als auch `API_BUSINESS_PARTNER_SRV` an.
* **Ressourcen-Discovery:** Beantwortet `ServiceCollection('API_BUSINESS_PARTNER_0001')/EntitySets` automatisch für die automatische Proxy-Ressourcengenerierung im APIM.
* **Dual-Format:** Unterstützt OData JSON und Atom XML Feed.



