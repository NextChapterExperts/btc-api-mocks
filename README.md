# ⚡ BTC API Mocks (Next Chapter Experts)

> **Zweck:** Zentrale, öffentlich erreichbare Mock-APIs für Schulungen und Demos (SAP BTP Integration Suite, Integration Cell, API Management, MCP Gateway).  
> **Host:** Vercel Serverless (Dauerhaft online & kostenlos).

---

## 🧭 Enthaltene Schnittstellen

| Schnittstelle | Protokoll / Format | Authentifizierung | Status |
| :--- | :--- | :--- | :---: |
| **Smart Meter Energy Services** | REST (OpenAPI 3.0.3) / OData-kompatibel | **OAuth 2.0 Client Credentials** (`/oauth/token`) & **Refresh Token** sowie **API Key** | 🟢 Bereit |
| **IS-U Meter-to-Cash Service** | OData v2 / v4 (`$metadata`) | Basic Auth / OAuth2 | 🟡 Geplant |
| **Legacy Marktkommunikation** | SOAP / XML (WSDL) | Basic Auth / WS-Security | 🟡 Geplant |

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
