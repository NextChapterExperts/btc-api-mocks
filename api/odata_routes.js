// Dedicated OData Middleware to guarantee $metadata and entity handling
module.exports = function setupOData(app, getBaseUrl, meterDatabase) {

  // 1. OData v2 $metadata XML
  app.use((req, res, next) => {
    if (req.path === '/odata/v2/utility/$metadata' || req.path === '/odata/v2/utility/%24metadata') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.send(`<?xml version="1.0" encoding="utf-8"?>
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
    }

    // 2. OData v4 $metadata XML
    if (req.path === '/odata/v4/utility/$metadata' || req.path === '/odata/v4/utility/%24metadata') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.send(`<?xml version="1.0" encoding="utf-8"?>
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
    }

    next();
  });
};
