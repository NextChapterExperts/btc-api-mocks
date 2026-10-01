/**
 * SAP NetWeaver Gateway Catalog Service Mock (IWFND/CATALOGSERVICE;v=2 & S/4HANA OData Discovery)
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
      TechnicalName: "API_BUSINESS_PARTNER",
      Version: "0001",
      Description: "SAP S/4HANA Business Partner (A2X) OData v2 Service",
      Title: "API_BUSINESS_PARTNER",
      Author: "SAP Gateway",
      ExternalServiceName: "API_BUSINESS_PARTNER",
      ExternalName: "API_BUSINESS_PARTNER",
      ServiceUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      Url: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      ServiceVersion: "0001",
      Namespace: "/SAP/",
      ServiceUrlForMetadata: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      MetadataUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      ServiceType: "OData",
      ReleaseStatus: "RELEASED",
      IsActive: true
    },
    {
      ID: "API_BUSINESS_PARTNER_SRV_0001",
      TechnicalServiceName: "API_BUSINESS_PARTNER_SRV",
      TechnicalServiceVersion: "0001",
      TechnicalName: "API_BUSINESS_PARTNER_SRV",
      Version: "0001",
      Description: "SAP S/4HANA Business Partner OData v2 Service (SRV Alias)",
      Title: "API_BUSINESS_PARTNER_SRV",
      Author: "SAP Gateway",
      ExternalServiceName: "API_BUSINESS_PARTNER_SRV",
      ExternalName: "API_BUSINESS_PARTNER_SRV",
      ServiceUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      Url: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      ServiceVersion: "0001",
      Namespace: "/SAP/",
      ServiceUrlForMetadata: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      MetadataUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      ServiceType: "OData",
      ReleaseStatus: "RELEASED",
      IsActive: true
    },
    {
      ID: "OP_API_BUSINESS_PARTNER_SRV_0001",
      TechnicalServiceName: "OP_API_BUSINESS_PARTNER_SRV",
      TechnicalServiceVersion: "0001",
      TechnicalName: "OP_API_BUSINESS_PARTNER_SRV",
      Version: "0001",
      Description: "SAP S/4HANA Business Partner OData v2 Service (API Hub Specification)",
      Title: "OP_API_BUSINESS_PARTNER_SRV",
      Author: "SAP Gateway",
      ExternalServiceName: "OP_API_BUSINESS_PARTNER_SRV",
      ExternalName: "OP_API_BUSINESS_PARTNER_SRV",
      ServiceUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      Url: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/",
      ServiceVersion: "0001",
      Namespace: "/SAP/",
      ServiceUrlForMetadata: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      MetadataUrl: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      ServiceType: "OData",
      ReleaseStatus: "RELEASED",
      IsActive: true
    },
    {
      ID: "BTC_UTILITY_ISU_SRV_0001",
      TechnicalServiceName: "BTC_UTILITY_ISU_SRV",
      TechnicalServiceVersion: "0001",
      TechnicalName: "BTC_UTILITY_ISU_SRV",
      Version: "0001",
      Description: "BTC IS-U Meter-to-Cash Utility Readings Service",
      Title: "BTC_UTILITY_ISU_SRV",
      Author: "BTC AG",
      ExternalServiceName: "BTC_UTILITY_ISU_SRV",
      ExternalName: "BTC_UTILITY_ISU_SRV",
      ServiceUrl: "/odata/v2/utility/",
      Url: "/odata/v2/utility/",
      ServiceVersion: "0001",
      Namespace: "/BTC/",
      ServiceUrlForMetadata: "/odata/v2/utility/$metadata",
      MetadataUrl: "/odata/v2/utility/$metadata",
      ServiceType: "OData",
      ReleaseStatus: "RELEASED",
      IsActive: true
    },
    {
      ID: "BTC_SMARTMETER_SRV_0001",
      TechnicalServiceName: "BTC_SMARTMETER_SRV",
      TechnicalServiceVersion: "0001",
      TechnicalName: "BTC_SMARTMETER_SRV",
      Version: "0001",
      Description: "BTC Smart Meter Energy Ingestion & Load Profiles",
      Title: "BTC_SMARTMETER_SRV",
      Author: "BTC AG",
      ExternalServiceName: "BTC_SMARTMETER_SRV",
      ExternalName: "BTC_SMARTMETER_SRV",
      ServiceUrl: "/api/v1/",
      Url: "/api/v1/",
      ServiceVersion: "0001",
      Namespace: "/BTC/",
      ServiceUrlForMetadata: "/openapi.json",
      MetadataUrl: "/openapi.json",
      ServiceType: "REST/OpenAPI",
      ReleaseStatus: "RELEASED",
      IsActive: true
    }
  ];

  // EntitySets für Detail-Discovery der Schnittstellen
  const bpEntitySets = [
    { Name: "A_BusinessPartner", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_BusinessPartnerAddress", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_Customer", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_Supplier", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_BusinessPartnerRole", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_BusinessPartnerBank", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_AddressEmailAddress", ServiceID: "API_BUSINESS_PARTNER_0001" },
    { Name: "A_AddressPhoneNumber", ServiceID: "API_BUSINESS_PARTNER_0001" }
  ];

  // Helper für CORS & Audit-Logging
  function handleCatalogRequest(req, res, action) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, apikey, Accept, X-CSRF-Token, DataServiceVersion, MaxDataServiceVersion');
    res.setHeader('Access-Control-Expose-Headers', 'DataServiceVersion, MaxDataServiceVersion, X-CSRF-Token, sap-server');
    res.setHeader('DataServiceVersion', '2.0');
    res.setHeader('dataserviceversion', '2.0');
    res.setHeader('sap-server', 'true');
    
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
        <Property Name="TechnicalName" Type="Edm.String" MaxLength="100" sap:label="Technischer Name" />
        <Property Name="Version" Type="Edm.String" MaxLength="10" sap:label="Version" />
        <Property Name="Description" Type="Edm.String" MaxLength="255" sap:label="Beschreibung" />
        <Property Name="Title" Type="Edm.String" MaxLength="100" sap:label="Titel" />
        <Property Name="Author" Type="Edm.String" MaxLength="100" sap:label="Autor" />
        <Property Name="ExternalServiceName" Type="Edm.String" MaxLength="100" sap:label="Externer Name" />
        <Property Name="ExternalName" Type="Edm.String" MaxLength="100" sap:label="Externer Name" />
        <Property Name="ServiceUrl" Type="Edm.String" MaxLength="255" sap:label="Service-URL" />
        <Property Name="Url" Type="Edm.String" MaxLength="255" sap:label="Service-URL" />
        <Property Name="ServiceVersion" Type="Edm.String" MaxLength="10" sap:label="Service-Version" />
        <Property Name="Namespace" Type="Edm.String" MaxLength="50" sap:label="Namensraum" />
        <Property Name="ServiceUrlForMetadata" Type="Edm.String" MaxLength="255" sap:label="Metadaten-URL" />
        <Property Name="MetadataUrl" Type="Edm.String" MaxLength="255" sap:label="Metadaten-URL" />
        <Property Name="ServiceType" Type="Edm.String" MaxLength="20" sap:label="Typ" />
        <Property Name="ReleaseStatus" Type="Edm.String" MaxLength="20" sap:label="Release-Status" />
        <Property Name="IsActive" Type="Edm.Boolean" sap:label="Aktiv" />
        <NavigationProperty Name="EntitySets" Relationship="CATALOGSERVICE.Service_EntitySets" FromRole="From_Service" ToRole="To_EntitySets" />
      </EntityType>
      <EntityType Name="EntitySet" sap:content-version="1">
        <Key>
          <PropertyRef Name="Name" />
          <PropertyRef Name="ServiceID" />
        </Key>
        <Property Name="Name" Type="Edm.String" Nullable="false" MaxLength="100" sap:label="EntitySet-Name" />
        <Property Name="ServiceID" Type="Edm.String" Nullable="false" MaxLength="255" sap:label="Service-ID" />
      </EntityType>
      <Association Name="Service_EntitySets">
        <End Type="CATALOGSERVICE.Service" Multiplicity="1" Role="From_Service" />
        <End Type="CATALOGSERVICE.EntitySet" Multiplicity="*" Role="To_EntitySets" />
      </Association>
      <EntityContainer Name="CATALOGSERVICE_Entities" m:IsDefaultEntityContainer="true">
        <EntitySet Name="ServiceCollection" EntityType="CATALOGSERVICE.Service" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:pageable="true" />
        <EntitySet Name="RecommendedServiceCollection" EntityType="CATALOGSERVICE.Service" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:pageable="true" />
        <EntitySet Name="ScopedServiceCollection" EntityType="CATALOGSERVICE.Service" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:pageable="true" />
        <EntitySet Name="EntitySetCollection" EntityType="CATALOGSERVICE.EntitySet" sap:creatable="false" sap:updatable="false" sap:deletable="false" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

  // Helper zum Erzeugen des Atom/XML Formats für ServiceCollection
  function renderServiceCollectionXML(items, baseUrl, collectionName, totalCount, serviceRoot) {
    const collName = collectionName || "ServiceCollection";
    const sRoot = serviceRoot || "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/";
    const entriesXML = items.map(item => `
  <entry>
    <id>${baseUrl}${sRoot}${collName}('${item.ID}')</id>
    <title type="text">${item.Title}</title>
    <summary type="text">${item.Description}</summary>
    <updated>${new Date().toISOString()}</updated>
    <author><name/></author>
    <link href="${collName}('${item.ID}')" rel="edit" title="Service" />
    <link href="${collName}('${item.ID}')" rel="self" title="Service" />
    <link href="${collName}('${item.ID}')/EntitySets" rel="http://schemas.microsoft.com/ado/2007/08/dataservices/related/EntitySets" type="application/atom+xml;type=feed" title="EntitySets" />
    <category term="CATALOGSERVICE.Service" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme" />
    <content type="application/xml">
      <m:properties>
        <d:ID>${item.ID}</d:ID>
        <d:TechnicalServiceName>${item.TechnicalServiceName}</d:TechnicalServiceName>
        <d:TechnicalServiceVersion>${item.TechnicalServiceVersion}</d:TechnicalServiceVersion>
        <d:TechnicalName>${item.TechnicalName}</d:TechnicalName>
        <d:Version>${item.Version}</d:Version>
        <d:Description>${item.Description}</d:Description>
        <d:Title>${item.Title}</d:Title>
        <d:Author>${item.Author || 'SAP Gateway'}</d:Author>
        <d:ExternalServiceName>${item.ExternalServiceName}</d:ExternalServiceName>
        <d:ExternalName>${item.ExternalName}</d:ExternalName>
        <d:ServiceUrl>${item.ServiceUrl}</d:ServiceUrl>
        <d:Url>${item.Url}</d:Url>
        <d:ServiceVersion>${item.ServiceVersion}</d:ServiceVersion>
        <d:Namespace>${item.Namespace}</d:Namespace>
        <d:ServiceUrlForMetadata>${item.ServiceUrlForMetadata}</d:ServiceUrlForMetadata>
        <d:MetadataUrl>${item.MetadataUrl}</d:MetadataUrl>
        <d:ServiceType>${item.ServiceType}</d:ServiceType>
        <d:ReleaseStatus>${item.ReleaseStatus}</d:ReleaseStatus>
        <d:IsActive m:type="Edm.Boolean">${item.IsActive}</d:IsActive>
      </m:properties>
    </content>
  </entry>`).join('');

    const countXML = totalCount !== undefined ? `\n  <m:count>${totalCount}</m:count>` : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<feed xml:base="${baseUrl}${sRoot}" xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices">
  <id>${baseUrl}${sRoot}${collName}</id>
  <title type="text">${collName}</title>
  <updated>${new Date().toISOString()}</updated>
  <author><name/></author>
  <link href="${collName}" rel="self" title="${collName}" />${countXML}
  ${entriesXML}
</feed>`;
  }

  // Helper zum Erzeugen des Atom/XML Formats für EntitySets Navigation
  function renderEntitySetsXML(items, baseUrl, serviceId) {
    const entriesXML = items.map(item => `
  <entry>
    <id>${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/EntitySetCollection(Name='${item.Name}',ServiceID='${item.ServiceID}')</id>
    <title type="text">${item.Name}</title>
    <updated>${new Date().toISOString()}</updated>
    <author><name/></author>
    <link href="EntitySetCollection(Name='${item.Name}',ServiceID='${item.ServiceID}')" rel="edit" title="EntitySet" />
    <link href="EntitySetCollection(Name='${item.Name}',ServiceID='${item.ServiceID}')" rel="self" title="EntitySet" />
    <category term="CATALOGSERVICE.EntitySet" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme" />
    <content type="application/xml">
      <m:properties>
        <d:Name>${item.Name}</d:Name>
        <d:ServiceID>${item.ServiceID}</d:ServiceID>
      </m:properties>
    </content>
  </entry>`).join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<feed xml:base="${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/" xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices">
  <id>${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${serviceId}')/EntitySets</id>
  <title type="text">EntitySets</title>
  <updated>${new Date().toISOString()}</updated>
  <author><name/></author>
  <link href="EntitySets" rel="self" title="EntitySets" />
  ${entriesXML}
</feed>`;
  }

  // Helper für Service Document (AtomPub XML)
  function renderServiceDocumentXML(baseUrl, serviceRoot) {
    const sRoot = serviceRoot || "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/";
    return `<?xml version="1.0" encoding="utf-8"?>
<service xml:base="${baseUrl}${sRoot}" xmlns="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <workspace>
    <atom:title>Default</atom:title>
    <collection href="ServiceCollection"><atom:title>ServiceCollection</atom:title></collection>
    <collection href="RecommendedServiceCollection"><atom:title>RecommendedServiceCollection</atom:title></collection>
    <collection href="ScopedServiceCollection"><atom:title>ScopedServiceCollection</atom:title></collection>
    <collection href="EntitySetCollection"><atom:title>EntitySetCollection</atom:title></collection>
  </workspace>
</service>`;
  }

  // =============================================================
  // 2. UNIVERSAL MIDDLEWARE FÜR ALLE SAP APIM DISCOVERY VARIANTEN
  // =============================================================
  app.use((req, res, next) => {
    // Normalisiere doppelte Pfadsegmente, die durch APIM-Konkatenation (PathPrefix + ServiceCollectionUrl) entstehen können
    if (req.url && req.url.includes('/sap/opu/odata/sap/opu/odata')) {
      req.url = req.url.replace(/(\/sap\/opu\/odata)+/gi, '/sap/opu/odata');
    }
    if (req.originalUrl && req.originalUrl.includes('/sap/opu/odata/sap/opu/odata')) {
      req.originalUrl = req.originalUrl.replace(/(\/sap\/opu\/odata)+/gi, '/sap/opu/odata');
    }

    const rawPath = (req.path || req.url || '').toLowerCase();
    const origUrl = (req.originalUrl || '').toLowerCase();
    
    // Prüfen, ob eine Catalog-, IWFND- oder Collection-Anfrage vorliegt
    const isCatalog = rawPath.includes('catalogservice') || origUrl.includes('catalogservice') ||
                      rawPath.includes('iwfnd') || origUrl.includes('iwfnd');
    const isServiceCollection = rawPath.includes('servicecollection') || origUrl.includes('servicecollection');
    const isRecommended = rawPath.includes('recommendedservicecollection') || origUrl.includes('recommendedservicecollection');
    
    // Prüfen auf SAP OData Root Abfragen (z.B. /sap/opu/odata, /sap/opu/odata/, /sap/opu/odata/sap/, /sap/opu/odata/iwfnd)
    const isODataRoot = (rawPath === '/sap/opu/odata' || rawPath === '/sap/opu/odata/' ||
                         rawPath === '/sap/opu/odata/sap' || rawPath === '/sap/opu/odata/sap/' ||
                         rawPath === '/sap/opu/odata/iwfnd' || rawPath === '/sap/opu/odata/iwfnd/' ||
                         origUrl === '/sap/opu/odata' || origUrl === '/sap/opu/odata/' ||
                         origUrl === '/sap/opu/odata/sap' || origUrl === '/sap/opu/odata/sap/' ||
                         origUrl === '/sap/opu/odata/iwfnd' || origUrl === '/sap/opu/odata/iwfnd/');

    if (isCatalog || isServiceCollection || isRecommended || isODataRoot) {
      
      // 1. $metadata Anfrage
      if (rawPath.includes('$metadata') || rawPath.includes('%24metadata') || origUrl.includes('$metadata') || origUrl.includes('%24metadata')) {
        handleCatalogRequest(req, res, 'Catalog$metadata');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.send(catalogMetadataXML);
      }

      // 2. ServiceCollection Navigation: EntitySets (z.B. ServiceCollection('...')/EntitySets)
      if (rawPath.includes('/entitysets') || origUrl.includes('/entitysets')) {
        handleCatalogRequest(req, res, 'ServiceCollection/EntitySets');
        const baseUrl = getBaseUrl(req);
        const match = req.url.match(/ServiceCollection\(([^)]+)\)/i) || origUrl.match(/servicecollection\(([^)]+)\)/i);
        const serviceKey = match ? match[1].replace(/['"]/g, '') : "API_BUSINESS_PARTNER_0001";
        const isJson = req.query.$format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('xml'));

        if (isJson) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (req.method === 'HEAD') return res.status(200).end();
          return res.json({
            d: {
              results: bpEntitySets
            }
          });
        }

        res.setHeader('Content-Type', 'application/atom+xml; type=feed; charset=utf-8');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.send(renderEntitySetsXML(bpEntitySets, baseUrl, serviceKey));
      }

      // 3. Single Service lookup per Key: z.B. ServiceCollection('API_BUSINESS_PARTNER_0001')
      const singleMatch = req.url.match(/ServiceCollection\(([^)]+)\)/i) || origUrl.match(/servicecollection\(([^)]+)\)/i);
      if (singleMatch && !rawPath.includes('/entitysets')) {
        handleCatalogRequest(req, res, 'ServiceCollection(Key)');
        const baseUrl = getBaseUrl(req);
        let cleanKey = singleMatch[1].replace(/['"]/g, '');
        try { cleanKey = decodeURIComponent(cleanKey); } catch(e) {}
        
        // Flexible Suche nach ID, Name oder ohne führendes /SAP/
        const service = catalogServices.find(s => 
          s.ID === cleanKey || 
          s.TechnicalServiceName === cleanKey || 
          s.TechnicalName === cleanKey ||
          cleanKey.includes(s.TechnicalServiceName) ||
          cleanKey.includes(s.ID)
        ) || catalogServices[0]; // Fallback auf Business Partner
        
        const isJson = req.query.$format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('xml'));
        if (isJson) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (req.method === 'HEAD') return res.status(200).end();
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

        res.setHeader('Content-Type', 'application/atom+xml; type=entry; charset=utf-8');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.send(`<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices">
  <id>${baseUrl}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection('${service.ID}')</id>
  <title type="text">${service.Title}</title>
  <summary type="text">${service.Description}</summary>
  <updated>${new Date().toISOString()}</updated>
  <author><name/></author>
  <link href="ServiceCollection('${service.ID}')" rel="edit" title="Service" />
  <link href="ServiceCollection('${service.ID}')" rel="self" title="Service" />
  <link href="ServiceCollection('${service.ID}')/EntitySets" rel="http://schemas.microsoft.com/ado/2007/08/dataservices/related/EntitySets" type="application/atom+xml;type=feed" title="EntitySets" />
  <category term="CATALOGSERVICE.Service" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme" />
  <content type="application/xml">
    <m:properties>
      <d:ID>${service.ID}</d:ID>
      <d:TechnicalServiceName>${service.TechnicalServiceName}</d:TechnicalServiceName>
      <d:TechnicalServiceVersion>${service.TechnicalServiceVersion}</d:TechnicalServiceVersion>
      <d:TechnicalName>${service.TechnicalName}</d:TechnicalName>
      <d:Version>${service.Version}</d:Version>
      <d:Description>${service.Description}</d:Description>
      <d:Title>${service.Title}</d:Title>
      <d:ExternalServiceName>${service.ExternalServiceName}</d:ExternalServiceName>
      <d:ExternalName>${service.ExternalName}</d:ExternalName>
      <d:ServiceUrl>${service.ServiceUrl}</d:ServiceUrl>
      <d:Url>${service.Url}</d:Url>
      <d:ServiceVersion>${service.ServiceVersion}</d:ServiceVersion>
      <d:Namespace>${service.Namespace}</d:Namespace>
      <d:ServiceUrlForMetadata>${service.ServiceUrlForMetadata}</d:ServiceUrlForMetadata>
      <d:MetadataUrl>${service.MetadataUrl}</d:MetadataUrl>
      <d:ServiceType>${service.ServiceType}</d:ServiceType>
      <d:ReleaseStatus>${service.ReleaseStatus}</d:ReleaseStatus>
      <d:IsActive m:type="Edm.Boolean">${service.IsActive}</d:IsActive>
    </m:properties>
  </content>
</entry>`);
      }

      // 4. ServiceCollection / RecommendedServiceCollection Liste
      if (isServiceCollection || isRecommended || isODataRoot) {
        handleCatalogRequest(req, res, isRecommended ? 'RecommendedServiceCollection' : 'ServiceCollection');
        const baseUrl = getBaseUrl(req);
        let items = [...catalogServices];

        // Flexible Filter- & Suchverarbeitung (für SAP APIM UI Suchfeld)
        const filter = (req.query.$filter || '').toLowerCase();
        const search = (req.query.search || req.query.$search || '').replace(/['"]/g, '').toLowerCase();

        if (search) {
          items = items.filter(s => 
            s.TechnicalServiceName.toLowerCase().includes(search) ||
            s.Title.toLowerCase().includes(search) ||
            s.Description.toLowerCase().includes(search) ||
            s.ID.toLowerCase().includes(search)
          );
        }

        if (filter) {
          // Extrahiere ggf. gesuchte Namen aus startswith oder substringof
          const matchStart = filter.match(/startswith\s*\(\s*(?:tolower\s*\(\s*)?(\w+)(?:\s*\))?\s*,\s*'([^']+)'\s*\)/i);
          const matchSubstr = filter.match(/substringof\s*\(\s*'([^']+)'\s*,\s*(?:tolower\s*\(\s*)?(\w+)(?:\s*\))?\s*\)/i);

          if (matchStart) {
            const val = matchStart[2].toLowerCase();
            const filtered = items.filter(s => 
              s.TechnicalServiceName.toLowerCase().startsWith(val) ||
              s.Title.toLowerCase().startsWith(val) ||
              s.ID.toLowerCase().startsWith(val)
            );
            if (filtered.length > 0) items = filtered;
          } else if (matchSubstr) {
            const val = matchSubstr[1].toLowerCase();
            const filtered = items.filter(s => 
              s.TechnicalServiceName.toLowerCase().includes(val) ||
              s.Title.toLowerCase().includes(val) ||
              s.Description.toLowerCase().includes(val) ||
              s.ID.toLowerCase().includes(val)
            );
            if (filtered.length > 0) items = filtered;
          } else {
            // Nur filtern, wenn es sich um einen konkreten Namen/ID-Filter handelt (nicht System-Attribute wie isactive/servicetype/releasestatus)
            const matchNameEq = filter.match(/(?:TechnicalServiceName|Title|TechnicalName|ID)\s+eq\s+'([^']+)'/i);
            if (matchNameEq) {
              const val = matchNameEq[1].toLowerCase();
              const filtered = items.filter(s => 
                s.TechnicalServiceName.toLowerCase() === val ||
                s.ID.toLowerCase() === val ||
                s.TechnicalName.toLowerCase() === val
              );
              if (filtered.length > 0) items = filtered;
            }
          }
        }

        // Falls durch Filter wider Erwarten alles rausgefiltert wurde, Business Partner als Mindest-Schnittstelle erhalten
        if (items.length === 0) {
          items = [catalogServices[0]];
        }

        // Sortierung ($orderby)
        if (req.query.$orderby) {
          const parts = req.query.$orderby.trim().split(/\s+/);
          const field = parts[0];
          const isDesc = parts[1] && parts[1].toLowerCase() === 'desc';
          items.sort((a, b) => {
            const valA = (a[field] !== undefined ? a[field] : '').toString().toLowerCase();
            const valB = (b[field] !== undefined ? b[field] : '').toString().toLowerCase();
            return isDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
          });
        }

        const totalCount = items.length;

        // OData $count Handling (MUSS text/plain; charset=utf-8 und String zurückgeben, damit SAPUI5 ODataModel nicht abbricht)
        const isCount = rawPath.endsWith('/$count') || origUrl.endsWith('/$count') ||
                        rawPath.includes('/$count') || origUrl.includes('/$count') ||
                        rawPath.includes('/%24count') || origUrl.includes('/%24count');

        if (isCount) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          if (req.method === 'HEAD') return res.status(200).end();
          return res.send(String(totalCount));
        }

        // Paginierung ($top / $skip)
        const skip = parseInt(req.query.$skip, 10) || 0;
        const top = parseInt(req.query.$top, 10);
        let pagedItems = items.slice(skip);
        if (!isNaN(top)) {
          pagedItems = pagedItems.slice(0, top);
        }

        const sRoot = rawPath.includes(';v=2') || origUrl.includes(';v=2')
          ? "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/"
          : "/sap/opu/odata/IWFND/CATALOGSERVICE/";

        // Format-Erkennung (Standard für SAP Gateway ist XML Atom-Feed, es sei denn JSON wird explizit verlangt)
        const isJson = req.query.$format === 'json' || 
                       (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('xml'));

        if (!isJson) {
          res.setHeader('Content-Type', 'application/atom+xml; type=feed; charset=utf-8');
          if (req.method === 'HEAD') return res.status(200).end();
          const collName = isRecommended ? "RecommendedServiceCollection" : "ServiceCollection";
          return res.send(renderServiceCollectionXML(pagedItems, baseUrl, collName, totalCount, sRoot));
        }

        // JSON Response
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (req.method === 'HEAD') return res.status(200).end();

        const results = pagedItems.map(s => ({
          __metadata: {
            id: `${baseUrl}${sRoot}${isRecommended ? 'RecommendedServiceCollection' : 'ServiceCollection'}('${s.ID}')`,
            uri: `${baseUrl}${sRoot}${isRecommended ? 'RecommendedServiceCollection' : 'ServiceCollection'}('${s.ID}')`,
            type: "CATALOGSERVICE.Service"
          },
          ...s
        }));

        const responsePayload = {
          d: {
            results: results
          }
        };

        // Bei $inlinecount=allpages __count hinzufügen (essenziell für SAPUI5 Tabellen in APIM!)
        if (req.query.$inlinecount === 'allpages' || true) {
          responsePayload.d.__count = String(totalCount);
        }

        return res.json(responsePayload);
      }

      // 5. Catalog Service Root (Service Document)
      handleCatalogRequest(req, res, 'CatalogRoot');
      const sRoot = rawPath.includes(';v=2') || origUrl.includes(';v=2')
        ? "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/"
        : "/sap/opu/odata/IWFND/CATALOGSERVICE/";

      const isJson = req.query.$format === 'json' || 
                     (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('xml'));

      if (!isJson) {
        res.setHeader('Content-Type', 'application/atomsvc+xml; charset=utf-8');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.send(renderServiceDocumentXML(getBaseUrl(req), sRoot));
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.json({
        d: {
          EntitySets: [
            "ServiceCollection",
            "RecommendedServiceCollection",
            "ScopedServiceCollection",
            "EntitySetCollection"
          ]
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
