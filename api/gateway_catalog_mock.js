/**
 * SAP NetWeaver Gateway Catalog Service Mock (IWFND/CATALOGSERVICE;v=2)
 * 
 * Simuliert den offiziellen SAP Gateway Service-Katalog für SAP BTP API Management.
 * Wenn in SAP APIM ein "API Provider" vom Typ "SAP Gateway" / "Internet" angelegt wird,
 * ruft APIM die ServiceCollection URL auf, um alle verfügbaren OData-Schnittstellen
 * dynamisch aufzulisten und zur API-Proxy-Generierung anzubieten.
 */

module.exports = function setupGatewayCatalogMock(app, getBaseUrl, recordAuditLog) {

  // Katalog der verfügbaren OData-Services auf diesem Gateway-Mock
  const catalogServices = [
    {
      ID: "API_BUSINESS_PARTNER_0001",
      TechnicalServiceName: "API_BUSINESS_PARTNER",
      TechnicalServiceVersion: "0001",
      Description: "SAP S/4HANA Business Partner (A2X) OData v2 Service",
      Title: "API_BUSINESS_PARTNER",
      ExternalServiceName: "API_BUSINESS_PARTNER",
      ServiceUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      ServiceVersion: "0001",
      Namespace: "/SAP/",
      ServiceUrlForMetadata: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      ServiceType: "OData",
      ReleaseStatus: "RELEASED",
      IsActive: true
    },
    {
      ID: "BTC_UTILITY_ISU_SRV_0001",
      TechnicalServiceName: "BTC_UTILITY_ISU_SRV",
      TechnicalServiceVersion: "0001",
      Description: "BTC IS-U Meter-to-Cash Utility Readings Service",
      Title: "BTC_UTILITY_ISU_SRV",
      ExternalServiceName: "BTC_UTILITY_ISU_SRV",
      ServiceUrl: "/odata/v2/utility/",
      ServiceVersion: "0001",
      Namespace: "/BTC/",
      ServiceUrlForMetadata: "/odata/v2/utility/$metadata",
      ServiceType: "OData",
      ReleaseStatus: "RELEASED",
      IsActive: true
    },
    {
      ID: "BTC_SMARTMETER_SRV_0001",
      TechnicalServiceName: "BTC_SMARTMETER_SRV",
      TechnicalServiceVersion: "0001",
      Description: "BTC Smart Meter Energy Ingestion & Load Profiles",
      Title: "BTC_SMARTMETER_SRV",
      ExternalServiceName: "BTC_SMARTMETER_SRV",
      ServiceUrl: "/api/v1/",
      ServiceVersion: "0001",
      Namespace: "/BTC/",
      ServiceUrlForMetadata: "/openapi.json",
      ServiceType: "REST/OpenAPI",
      ReleaseStatus: "RELEASED",
      IsActive: true
    }
  ];

  // Helper für CORS & Audit-Logging
  function handleCatalogRequest(req, res, action) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, apikey, Accept, X-CSRF-Token');
    
    if (recordAuditLog) {
      recordAuditLog({
        endpoint: req.originalUrl || req.url,
        method: req.method,
        status: 200,
        authStatus: 'NO AUTH (PUBLIC GATEWAY CATALOG)',
        service: 'SAP Gateway Catalog Service (CATALOGSERVICE;v=2)',
        entity: action || 'ServiceCollection'
      });
    }
  }

  // =============================================================
  // 1. EDMX METADATEN DES KATALOG-SERVICES ($metadata)
  // =============================================================
  const catalogMetadataXML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData">
  <edmx:DataServices m:DataServiceVersion="2.0">
    <Schema Namespace="CATALOGSERVICE" xml:lang="de" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="Service" sap:content-version="1">
        <Key>
          <PropertyRef Name="ID" />
        </Key>
        <Property Name="ID" Type="Edm.String" Nullable="false" MaxLength="255" sap:label="Service-ID" />
        <Property Name="TechnicalServiceName" Type="Edm.String" MaxLength="100" sap:label="Technischer Name" />
        <Property Name="TechnicalServiceVersion" Type="Edm.String" MaxLength="10" sap:label="Version" />
        <Property Name="Description" Type="Edm.String" MaxLength="255" sap:label="Beschreibung" />
        <Property Name="Title" Type="Edm.String" MaxLength="100" sap:label="Titel" />
        <Property Name="ExternalServiceName" Type="Edm.String" MaxLength="100" sap:label="Externer Name" />
        <Property Name="ServiceUrl" Type="Edm.String" MaxLength="255" sap:label="Service-URL" />
        <Property Name="ServiceVersion" Type="Edm.String" MaxLength="10" sap:label="Service-Version" />
        <Property Name="Namespace" Type="Edm.String" MaxLength="50" sap:label="Namensraum" />
        <Property Name="ServiceUrlForMetadata" Type="Edm.String" MaxLength="255" sap:label="Metadaten-URL" />
        <Property Name="ServiceType" Type="Edm.String" MaxLength="20" sap:label="Typ" />
        <Property Name="ReleaseStatus" Type="Edm.String" MaxLength="20" sap:label="Release-Status" />
        <Property Name="IsActive" Type="Edm.Boolean" sap:label="Aktiv" />
      </EntityType>
      <EntityContainer Name="CATALOGSERVICE_Entities" m:IsDefaultEntityContainer="true">
        <EntitySet Name="ServiceCollection" EntityType="CATALOGSERVICE.Service" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:pageable="true" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

  // Helper zum Erzeugen des Atom/XML Formats für ServiceCollection
  function renderServiceCollectionXML(items, baseUrl, req) {
    const entriesXML = items.map(item => `
  <entry>
    <id>${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${item.ID}')</id>
    <title type="text">${item.Title}</title>
    <summary type="text">${item.Description}</summary>
    <updated>${new Date().toISOString()}</updated>
    <author><name>SAP Gateway Mock</name></author>
    <link rel="edit" title="Service" href="ServiceCollection('${item.ID}')" />
    <category term="CATALOGSERVICE.Service" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme" />
    <content type="application/xml">
      <m:properties>
        <d:ID>${item.ID}</d:ID>
        <d:TechnicalServiceName>${item.TechnicalServiceName}</d:TechnicalServiceName>
        <d:TechnicalServiceVersion>${item.TechnicalServiceVersion}</d:TechnicalServiceVersion>
        <d:Description>${item.Description}</d:Description>
        <d:Title>${item.Title}</d:Title>
        <d:ExternalServiceName>${item.ExternalServiceName}</d:ExternalServiceName>
        <d:ServiceUrl>${item.ServiceUrl}</d:ServiceUrl>
        <d:ServiceVersion>${item.ServiceVersion}</d:ServiceVersion>
        <d:Namespace>${item.Namespace}</d:Namespace>
        <d:ServiceUrlForMetadata>${item.ServiceUrlForMetadata}</d:ServiceUrlForMetadata>
        <d:ServiceType>${item.ServiceType}</d:ServiceType>
        <d:ReleaseStatus>${item.ReleaseStatus}</d:ReleaseStatus>
        <d:IsActive m:type="Edm.Boolean">${item.IsActive}</d:IsActive>
      </m:properties>
    </content>
  </entry>`).join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<feed xml:base="${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/" xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices">
  <id>${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection</id>
  <title type="text">ServiceCollection</title>
  <updated>${new Date().toISOString()}</updated>
  <author><name>SAP Gateway Mock</name></author>
  <link rel="self" title="ServiceCollection" href="ServiceCollection" />
  ${entriesXML}
</feed>`;
  }

  // =============================================================
  // 2. UNIVERSAL MIDDLEWARE FÜR ALLE SAP APIM VARIANTEN
  // =============================================================
  app.use((req, res, next) => {
    const rawPath = (req.path || req.url || '').toLowerCase();
    const origUrl = (req.originalUrl || '').toLowerCase();
    
    if (rawPath.includes('catalogservice') || origUrl.includes('catalogservice')) {
      // 1. $metadata Anfrage
      if (rawPath.includes('$metadata') || rawPath.includes('%24metadata') || origUrl.includes('$metadata') || origUrl.includes('%24metadata')) {
        handleCatalogRequest(req, res, 'Catalog$metadata');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        return res.send(catalogMetadataXML);
      }

      // 2. Single ServiceCollection key lookup: z.B. ServiceCollection('API_BUSINESS_PARTNER_0001')
      const singleMatch = req.url.match(/ServiceCollection\(([^)]+)\)/i) || origUrl.match(/servicecollection\(([^)]+)\)/i);
      if (singleMatch) {
        handleCatalogRequest(req, res, 'ServiceCollection(Key)');
        const baseUrl = getBaseUrl(req);
        const cleanKey = singleMatch[1].replace(/['"]/g, '');
        const service = catalogServices.find(s => s.ID === cleanKey || s.TechnicalServiceName === cleanKey);
        if (!service) {
          return res.status(404).json({ error: { code: "404", message: { value: `Service '${cleanKey}' im Katalog nicht gefunden.` } } });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json({
          d: {
            __metadata: {
              id: `${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${service.ID}')`,
              uri: `${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${service.ID}')`,
              type: "CATALOGSERVICE.Service"
            },
            ...service
          }
        });
      }

      // 3. ServiceCollection Liste
      if (rawPath.includes('servicecollection') || origUrl.includes('servicecollection')) {
        handleCatalogRequest(req, res, 'ServiceCollection');
        const baseUrl = getBaseUrl(req);
        let items = [...catalogServices];
        const filter = req.query.$filter;
        if (filter) {
          if (filter.includes("TechnicalServiceName eq '")) {
            const name = filter.split("TechnicalServiceName eq '")[1].split("'")[0];
            items = items.filter(s => s.TechnicalServiceName === name);
          } else if (filter.includes("startswith(TechnicalServiceName,")) {
            const match = filter.match(/startswith\(TechnicalServiceName,\s*'([^']+)'\)/i);
            if (match) {
              items = items.filter(s => s.TechnicalServiceName.toLowerCase().startsWith(match[1].toLowerCase()));
            }
          }
        }

        const isXml = (req.query.$format === 'xml') || (req.headers.accept && req.headers.accept.includes('xml') && !req.headers.accept.includes('json') && req.query.$format !== 'json');

        if (isXml) {
          res.setHeader('Content-Type', 'application/atom+xml; type=feed; charset=utf-8');
          return res.send(renderServiceCollectionXML(items, baseUrl, req));
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const results = items.map(s => ({
          __metadata: {
            id: `${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${s.ID}')`,
            uri: `${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${s.ID}')`,
            type: "CATALOGSERVICE.Service"
          },
          ...s
        }));

        return res.json({
          d: {
            results: results
          }
        });
      }

      // 4. Catalog Service Root
      handleCatalogRequest(req, res, 'CatalogRoot');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.json({
        d: {
          EntitySets: ["ServiceCollection"]
        }
      });
    }

    next();
  });

  return {
    catalogServices,
    catalogMetadataXML
  };
};
