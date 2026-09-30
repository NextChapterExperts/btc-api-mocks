/**
 * SAP S/4HANA OData v2 Business Partner Mock Service
 * Spezifikation: OP_API_BUSINESS_PARTNER_SRV (SAP Business Accelerator Hub)
 * Pfad: /sap/opu/odata/sap/API_BUSINESS_PARTNER
 * 
 * Authentifizierung: Keine (Public / No Auth) - ideal als Ziel-Backend für SAP BTP API Proxies.
 */

module.exports = function setupBusinessPartnerMock(app, getBaseUrl, recordAuditLog) {

  // =============================================================
  // 1. REALISTISCHE MOCK-DATEN (Deutsche Energiewirtschaft & Großkunden)
  // =============================================================
  const businessPartners = [
    {
      BusinessPartner: "1000010",
      Customer: "CUST-0010",
      Supplier: "SUPP-0010",
      AcademicTitle: "",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "2", // 2 = Organisation
      BusinessPartnerFullName: "BTC Business Technology Consulting AG",
      BusinessPartnerGrouping: "BP02",
      BusinessPartnerName: "BTC AG",
      BusinessPartnerUUID: "4a28f801-7b3c-4e89-8d1a-554433221101",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1577836800000)/",
      FirstName: "",
      LastName: "",
      LegalForm: "01",
      OrganizationBPName1: "BTC Business Technology Consulting AG",
      OrganizationBPName2: "Hauptsitz Oldenburg",
      SearchTerm1: "BTC",
      SearchTerm2: "OLDENBURG",
      Industry: "IT & Consulting",
      IsActiveEntity: true
    },
    {
      BusinessPartner: "1000020",
      Customer: "CUST-0020",
      Supplier: "SUPP-0020",
      AcademicTitle: "",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "2",
      BusinessPartnerFullName: "EWE AG Energie- und Telekommunikation",
      BusinessPartnerGrouping: "BP02",
      BusinessPartnerName: "EWE AG",
      BusinessPartnerUUID: "4a28f802-7b3c-4e89-8d1a-554433221102",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1580515200000)/",
      FirstName: "",
      LastName: "",
      LegalForm: "01",
      OrganizationBPName1: "EWE AG",
      OrganizationBPName2: "Konzernzentrale",
      SearchTerm1: "EWE",
      SearchTerm2: "ENERGIE",
      Industry: "Versorgungsindustrie",
      IsActiveEntity: true
    },
    {
      BusinessPartner: "1000030",
      Customer: "CUST-0030",
      Supplier: "",
      AcademicTitle: "",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "2",
      BusinessPartnerFullName: "Klinikum Oldenburg AöR",
      BusinessPartnerGrouping: "BP02",
      BusinessPartnerName: "Klinikum Oldenburg",
      BusinessPartnerUUID: "4a28f803-7b3c-4e89-8d1a-554433221103",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1609459200000)/",
      FirstName: "",
      LastName: "",
      LegalForm: "08",
      OrganizationBPName1: "Klinikum Oldenburg AöR",
      OrganizationBPName2: "Medizinischer Campus",
      SearchTerm1: "KLINIKUM",
      SearchTerm2: "KRITIS",
      Industry: "Gesundheitswesen",
      IsActiveEntity: true
    },
    {
      BusinessPartner: "1000040",
      Customer: "",
      Supplier: "SUPP-0040",
      AcademicTitle: "",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "2",
      BusinessPartnerFullName: "TenneT TSO GmbH Übertragungsnetzbetreiber",
      BusinessPartnerGrouping: "BP02",
      BusinessPartnerName: "TenneT TSO GmbH",
      BusinessPartnerUUID: "4a28f804-7b3c-4e89-8d1a-554433221104",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1612137600000)/",
      FirstName: "",
      LastName: "",
      LegalForm: "02",
      OrganizationBPName1: "TenneT TSO GmbH",
      OrganizationBPName2: "Netzbetrieb Nord",
      SearchTerm1: "TENNET",
      SearchTerm2: "TSO",
      Industry: "Übertragungsnetz",
      IsActiveEntity: true
    },
    {
      BusinessPartner: "1000050",
      Customer: "CUST-0050",
      Supplier: "",
      AcademicTitle: "Dr.",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "1", // 1 = Natürliche Person
      BusinessPartnerFullName: "Dr. Anna Lindemann",
      BusinessPartnerGrouping: "BP01",
      BusinessPartnerName: "Lindemann",
      BusinessPartnerUUID: "4a28f805-7b3c-4e89-8d1a-554433221105",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1625097600000)/",
      FirstName: "Anna",
      LastName: "Lindemann",
      LegalForm: "",
      OrganizationBPName1: "",
      OrganizationBPName2: "",
      SearchTerm1: "LINDEMANN",
      SearchTerm2: "PRIVATKUNDE",
      Industry: "Privathaushalt",
      IsActiveEntity: true
    },
    {
      BusinessPartner: "1000060",
      Customer: "CUST-0060",
      Supplier: "SUPP-0060",
      AcademicTitle: "",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "2",
      BusinessPartnerFullName: "Stadtwerke Delmenhorst GmbH",
      BusinessPartnerGrouping: "BP02",
      BusinessPartnerName: "Stadtwerke Delmenhorst",
      BusinessPartnerUUID: "4a28f806-7b3c-4e89-8d1a-554433221106",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1633046400000)/",
      FirstName: "",
      LastName: "",
      LegalForm: "02",
      OrganizationBPName1: "Stadtwerke Delmenhorst GmbH",
      OrganizationBPName2: "Netz & Vertrieb",
      SearchTerm1: "SWD",
      SearchTerm2: "DELMENHORST",
      Industry: "Kommunale Energie",
      IsActiveEntity: true
    },
    {
      BusinessPartner: "1000070",
      Customer: "",
      Supplier: "SUPP-0070",
      AcademicTitle: "",
      AuthorizationGroup: "",
      BusinessPartnerCategory: "2",
      BusinessPartnerFullName: "Siemens Energy Global GmbH & Co. KG",
      BusinessPartnerGrouping: "BP02",
      BusinessPartnerName: "Siemens Energy",
      BusinessPartnerUUID: "4a28f807-7b3c-4e89-8d1a-554433221107",
      CorrespondenceLanguage: "DE",
      CreatedByUser: "CB9980000010",
      CreationDate: "/Date(1640995200000)/",
      FirstName: "",
      LastName: "",
      LegalForm: "03",
      OrganizationBPName1: "Siemens Energy Global GmbH & Co. KG",
      OrganizationBPName2: "Grid Technologies",
      SearchTerm1: "SIEMENS",
      SearchTerm2: "ENERGY",
      Industry: "Turbinen & Transformatoren",
      IsActiveEntity: true
    }
  ];

  const addresses = [
    {
      AddressID: "ADR-0010",
      BusinessPartner: "1000010",
      CityName: "Oldenburg",
      PostalCode: "26121",
      StreetName: "Escherweg",
      HouseNumber: "5",
      Country: "DE",
      Region: "NI",
      Language: "DE",
      CareOfName: "BTC Hauptsitz",
      PrfrdCommMediumType: "INT"
    },
    {
      AddressID: "ADR-0020",
      BusinessPartner: "1000020",
      CityName: "Oldenburg",
      PostalCode: "26122",
      StreetName: "Tirpitzstraße",
      HouseNumber: "39",
      Country: "DE",
      Region: "NI",
      Language: "DE",
      CareOfName: "EWE Zentrale",
      PrfrdCommMediumType: "INT"
    },
    {
      AddressID: "ADR-0030",
      BusinessPartner: "1000030",
      CityName: "Oldenburg",
      PostalCode: "26133",
      StreetName: "Rahel-Straus-Straße",
      HouseNumber: "10",
      Country: "DE",
      Region: "NI",
      Language: "DE",
      CareOfName: "Klinikum Technikleitung",
      PrfrdCommMediumType: "TEL"
    },
    {
      AddressID: "ADR-0040",
      BusinessPartner: "1000040",
      CityName: "Bayreuth",
      PostalCode: "95448",
      StreetName: "Bernecker Straße",
      HouseNumber: "70",
      Country: "DE",
      Region: "BY",
      Language: "DE",
      CareOfName: "Netzleitstelle Nord-Süd",
      PrfrdCommMediumType: "INT"
    },
    {
      AddressID: "ADR-0050",
      BusinessPartner: "1000050",
      CityName: "Bremen",
      PostalCode: "28203",
      StreetName: "Ostertorsteinweg",
      HouseNumber: "42",
      Country: "DE",
      Region: "HB",
      Language: "DE",
      CareOfName: "",
      PrfrdCommMediumType: "INT"
    },
    {
      AddressID: "ADR-0060",
      BusinessPartner: "1000060",
      CityName: "Delmenhorst",
      PostalCode: "27749",
      StreetName: "Fischstraße",
      HouseNumber: "32",
      Country: "DE",
      Region: "NI",
      Language: "DE",
      CareOfName: "SWD Servicecenter",
      PrfrdCommMediumType: "INT"
    },
    {
      AddressID: "ADR-0070",
      BusinessPartner: "1000070",
      CityName: "Erlangen",
      PostalCode: "91058",
      StreetName: "Freyeslebenstraße",
      HouseNumber: "1",
      Country: "DE",
      Region: "BY",
      Language: "DE",
      CareOfName: "Grid Solutions",
      PrfrdCommMediumType: "INT"
    }
  ];

  const customers = [
    {
      Customer: "CUST-0010",
      BusinessPartner: "1000010",
      CustomerAccountGroup: "KUNA",
      CustomerClassification: "A",
      CustomerFullName: "BTC Business Technology Consulting AG",
      CustomerName: "BTC AG",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Customer: "CUST-0020",
      BusinessPartner: "1000020",
      CustomerAccountGroup: "KUNA",
      CustomerClassification: "A",
      CustomerFullName: "EWE AG",
      CustomerName: "EWE AG",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Customer: "CUST-0030",
      BusinessPartner: "1000030",
      CustomerAccountGroup: "KUNA",
      CustomerClassification: "B",
      CustomerFullName: "Klinikum Oldenburg AöR",
      CustomerName: "Klinikum Oldenburg",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Customer: "CUST-0050",
      BusinessPartner: "1000050",
      CustomerAccountGroup: "KUNP",
      CustomerClassification: "C",
      CustomerFullName: "Dr. Anna Lindemann",
      CustomerName: "Lindemann",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Customer: "CUST-0060",
      BusinessPartner: "1000060",
      CustomerAccountGroup: "KUNA",
      CustomerClassification: "A",
      CustomerFullName: "Stadtwerke Delmenhorst GmbH",
      CustomerName: "Stadtwerke Delmenhorst",
      PostingIsBlocked: false,
      DeletionIndicator: false
    }
  ];

  const suppliers = [
    {
      Supplier: "SUPP-0010",
      BusinessPartner: "1000010",
      SupplierAccountGroup: "LIEF",
      SupplierFullName: "BTC Business Technology Consulting AG",
      SupplierName: "BTC AG",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Supplier: "SUPP-0020",
      BusinessPartner: "1000020",
      SupplierAccountGroup: "LIEF",
      SupplierFullName: "EWE AG",
      SupplierName: "EWE AG",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Supplier: "SUPP-0040",
      BusinessPartner: "1000040",
      SupplierAccountGroup: "LIEF",
      SupplierFullName: "TenneT TSO GmbH",
      SupplierName: "TenneT TSO",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Supplier: "SUPP-0060",
      BusinessPartner: "1000060",
      SupplierAccountGroup: "LIEF",
      SupplierFullName: "Stadtwerke Delmenhorst GmbH",
      SupplierName: "Stadtwerke Delmenhorst",
      PostingIsBlocked: false,
      DeletionIndicator: false
    },
    {
      Supplier: "SUPP-0070",
      BusinessPartner: "1000070",
      SupplierAccountGroup: "LIEF",
      SupplierFullName: "Siemens Energy Global GmbH & Co. KG",
      SupplierName: "Siemens Energy",
      PostingIsBlocked: false,
      DeletionIndicator: false
    }
  ];

  const roles = [
    { BusinessPartner: "1000010", BusinessPartnerRole: "FLCU01", RoleCategory: "CRM000", ValidFrom: "/Date(1577836800000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000010", BusinessPartnerRole: "FLVN01", RoleCategory: "VEND00", ValidFrom: "/Date(1577836800000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000020", BusinessPartnerRole: "FLCU00", RoleCategory: "FI0001", ValidFrom: "/Date(1580515200000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000030", BusinessPartnerRole: "FLCU00", RoleCategory: "FI0001", ValidFrom: "/Date(1609459200000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000040", BusinessPartnerRole: "FLVN00", RoleCategory: "FI0002", ValidFrom: "/Date(1612137600000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000050", BusinessPartnerRole: "FLCU00", RoleCategory: "FI0001", ValidFrom: "/Date(1625097600000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000060", BusinessPartnerRole: "FLCU00", RoleCategory: "FI0001", ValidFrom: "/Date(1633046400000)/", ValidTo: "/Date(253402214400000)/" },
    { BusinessPartner: "1000070", BusinessPartnerRole: "FLVN00", RoleCategory: "FI0002", ValidFrom: "/Date(1640995200000)/", ValidTo: "/Date(253402214400000)/" }
  ];

  const banks = [
    { BusinessPartner: "1000010", BankIdentification: "0001", BankCountryKey: "DE", BankNumber: "28050100", BankName: "Landessparkasse zu Oldenburg", IBAN: "DE89280501000012345678" },
    { BusinessPartner: "1000020", BankIdentification: "0001", BankCountryKey: "DE", BankNumber: "28020050", BankName: "Oldenburgische Landesbank AG", IBAN: "DE23280200500098765432" },
    { BusinessPartner: "1000030", BankIdentification: "0001", BankCountryKey: "DE", BankNumber: "28050100", BankName: "Landessparkasse zu Oldenburg", IBAN: "DE45280501000055443322" },
    { BusinessPartner: "1000040", BankIdentification: "0001", BankCountryKey: "DE", BankNumber: "77350110", BankName: "Sparkasse Bayreuth", IBAN: "DE67773501100011223344" }
  ];

  const emails = [
    { AddressID: "ADR-0010", Person: "", OrdinalNumber: "001", IsDefaultEmailAddress: true, EmailAddress: "kontakt@btc-ag.com", SearchEmailAddress: "KONTAKT@BTC-AG.COM" },
    { AddressID: "ADR-0020", Person: "", OrdinalNumber: "001", IsDefaultEmailAddress: true, EmailAddress: "service@ewe.de", SearchEmailAddress: "SERVICE@EWE.DE" },
    { AddressID: "ADR-0030", Person: "", OrdinalNumber: "001", IsDefaultEmailAddress: true, EmailAddress: "technik@klinikum-oldenburg.de", SearchEmailAddress: "TECHNIK@KLINIKUM-OLDENBURG.DE" },
    { AddressID: "ADR-0040", Person: "", OrdinalNumber: "001", IsDefaultEmailAddress: true, EmailAddress: "operations@tennet.eu", SearchEmailAddress: "OPERATIONS@TENNET.EU" },
    { AddressID: "ADR-0050", Person: "", OrdinalNumber: "001", IsDefaultEmailAddress: true, EmailAddress: "anna.lindemann@gmx.de", SearchEmailAddress: "ANNA.LINDEMANN@GMX.DE" }
  ];

  const phones = [
    { AddressID: "ADR-0010", Person: "", OrdinalNumber: "001", IsDefaultPhoneNumber: true, PhoneNumber: "+49 441 3612-0" },
    { AddressID: "ADR-0020", Person: "", OrdinalNumber: "001", IsDefaultPhoneNumber: true, PhoneNumber: "+49 441 803-0" },
    { AddressID: "ADR-0030", Person: "", OrdinalNumber: "001", IsDefaultPhoneNumber: true, PhoneNumber: "+49 441 403-0" },
    { AddressID: "ADR-0040", Person: "", OrdinalNumber: "001", IsDefaultPhoneNumber: true, PhoneNumber: "+49 921 50740-0" },
    { AddressID: "ADR-0050", Person: "", OrdinalNumber: "001", IsDefaultPhoneNumber: true, PhoneNumber: "+49 421 1234567" }
  ];

  // Basis-Pfad gemäß SAP S/4HANA Standard
  const BASE_PATH = '/sap/opu/odata/sap/API_BUSINESS_PARTNER';

  // Helper für CORS & Audit-Logging
  function handleODataRequest(req, res, entityName) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
        authStatus: 'NO AUTH (PUBLIC MOCK)',
        service: 'SAP S/4HANA Business Partner OData v2',
        entity: entityName || 'Service'
      });
    }
  }

  // =============================================================
  // 2. EDMX $metadata XML (Vollständig kompatibel zu SAP APIM / Integration Suite)
  // =============================================================
  const metadataXML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData">
  <edmx:DataServices m:DataServiceVersion="2.0">
    <Schema Namespace="API_BUSINESS_PARTNER" xml:lang="de" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      
      <!-- EntityType: A_BusinessPartnerType -->
      <EntityType Name="A_BusinessPartnerType" sap:content-version="1">
        <Key>
          <PropertyRef Name="BusinessPartner" />
        </Key>
        <Property Name="BusinessPartner" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Geschäftspartner" />
        <Property Name="Customer" Type="Edm.String" MaxLength="10" sap:label="Debitorennummer" />
        <Property Name="Supplier" Type="Edm.String" MaxLength="10" sap:label="Kreditorennummer" />
        <Property Name="AcademicTitle" Type="Edm.String" MaxLength="4" sap:label="Akad. Titel" />
        <Property Name="AuthorizationGroup" Type="Edm.String" MaxLength="4" sap:label="Berechtigungsgruppe" />
        <Property Name="BusinessPartnerCategory" Type="Edm.String" MaxLength="1" sap:label="GP-Typ (1=Person, 2=Organisation)" />
        <Property Name="BusinessPartnerFullName" Type="Edm.String" MaxLength="81" sap:label="Vollständiger Name" />
        <Property Name="BusinessPartnerGrouping" Type="Edm.String" MaxLength="4" sap:label="Gruppierung" />
        <Property Name="BusinessPartnerName" Type="Edm.String" MaxLength="81" sap:label="GP-Name" />
        <Property Name="BusinessPartnerUUID" Type="Edm.Guid" sap:label="GP GUID" />
        <Property Name="CorrespondenceLanguage" Type="Edm.String" MaxLength="2" sap:label="Sprache" />
        <Property Name="CreatedByUser" Type="Edm.String" MaxLength="12" sap:label="Erfasst von" />
        <Property Name="CreationDate" Type="Edm.DateTime" Precision="0" sap:label="Erfasst am" />
        <Property Name="FirstName" Type="Edm.String" MaxLength="40" sap:label="Vorname" />
        <Property Name="LastName" Type="Edm.String" MaxLength="40" sap:label="Nachname" />
        <Property Name="LegalForm" Type="Edm.String" MaxLength="2" sap:label="Rechtsform" />
        <Property Name="OrganizationBPName1" Type="Edm.String" MaxLength="40" sap:label="Name 1 d. Organisation" />
        <Property Name="OrganizationBPName2" Type="Edm.String" MaxLength="40" sap:label="Name 2 d. Organisation" />
        <Property Name="SearchTerm1" Type="Edm.String" MaxLength="20" sap:label="Suchbegriff 1" />
        <Property Name="SearchTerm2" Type="Edm.String" MaxLength="20" sap:label="Suchbegriff 2" />
        <Property Name="Industry" Type="Edm.String" MaxLength="10" sap:label="Branche" />
        <Property Name="IsActiveEntity" Type="Edm.Boolean" sap:label="Ist aktiv" />
        
        <NavigationProperty Name="to_BusinessPartnerAddress" Relationship="API_BUSINESS_PARTNER.Assoc_BusinessPartner_to_Address" FromRole="From_BusinessPartner" ToRole="To_Address" />
        <NavigationProperty Name="to_Customer" Relationship="API_BUSINESS_PARTNER.Assoc_BusinessPartner_to_Customer" FromRole="From_BusinessPartner" ToRole="To_Customer" />
        <NavigationProperty Name="to_Supplier" Relationship="API_BUSINESS_PARTNER.Assoc_BusinessPartner_to_Supplier" FromRole="From_BusinessPartner" ToRole="To_Supplier" />
        <NavigationProperty Name="to_BusinessPartnerRole" Relationship="API_BUSINESS_PARTNER.Assoc_BusinessPartner_to_Role" FromRole="From_BusinessPartner" ToRole="To_Role" />
        <NavigationProperty Name="to_BusinessPartnerBank" Relationship="API_BUSINESS_PARTNER.Assoc_BusinessPartner_to_Bank" FromRole="From_BusinessPartner" ToRole="To_Bank" />
      </EntityType>

      <!-- EntityType: A_BusinessPartnerAddressType -->
      <EntityType Name="A_BusinessPartnerAddressType" sap:content-version="1">
        <Key>
          <PropertyRef Name="BusinessPartner" />
          <PropertyRef Name="AddressID" />
        </Key>
        <Property Name="BusinessPartner" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Geschäftspartner" />
        <Property Name="AddressID" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Adressnummer" />
        <Property Name="CityName" Type="Edm.String" MaxLength="40" sap:label="Ort" />
        <Property Name="PostalCode" Type="Edm.String" MaxLength="10" sap:label="Postleitzahl" />
        <Property Name="StreetName" Type="Edm.String" MaxLength="60" sap:label="Straße" />
        <Property Name="HouseNumber" Type="Edm.String" MaxLength="10" sap:label="Hausnummer" />
        <Property Name="Country" Type="Edm.String" MaxLength="3" sap:label="Land" />
        <Property Name="Region" Type="Edm.String" MaxLength="3" sap:label="Bundesland / Region" />
        <Property Name="Language" Type="Edm.String" MaxLength="2" sap:label="Sprache" />
        <Property Name="CareOfName" Type="Edm.String" MaxLength="40" sap:label="c/o Name" />
        <Property Name="PrfrdCommMediumType" Type="Edm.String" MaxLength="3" sap:label="Komm.-Art" />
        <NavigationProperty Name="to_EmailAddress" Relationship="API_BUSINESS_PARTNER.Assoc_Address_to_Email" FromRole="From_Address" ToRole="To_Email" />
        <NavigationProperty Name="to_PhoneNumber" Relationship="API_BUSINESS_PARTNER.Assoc_Address_to_Phone" FromRole="From_Address" ToRole="To_Phone" />
      </EntityType>

      <!-- EntityType: A_CustomerType -->
      <EntityType Name="A_CustomerType" sap:content-version="1">
        <Key>
          <PropertyRef Name="Customer" />
        </Key>
        <Property Name="Customer" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Debitor" />
        <Property Name="BusinessPartner" Type="Edm.String" MaxLength="10" sap:label="Geschäftspartner" />
        <Property Name="CustomerAccountGroup" Type="Edm.String" MaxLength="4" sap:label="Kontengruppe" />
        <Property Name="CustomerClassification" Type="Edm.String" MaxLength="2" sap:label="Klassifizierung" />
        <Property Name="CustomerFullName" Type="Edm.String" MaxLength="220" sap:label="Name des Debitors" />
        <Property Name="CustomerName" Type="Edm.String" MaxLength="35" sap:label="Kurzname" />
        <Property Name="PostingIsBlocked" Type="Edm.Boolean" sap:label="Buchungssperre" />
        <Property Name="DeletionIndicator" Type="Edm.Boolean" sap:label="Löschvormerkung" />
      </EntityType>

      <!-- EntityType: A_SupplierType -->
      <EntityType Name="A_SupplierType" sap:content-version="1">
        <Key>
          <PropertyRef Name="Supplier" />
        </Key>
        <Property Name="Supplier" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Kreditor" />
        <Property Name="BusinessPartner" Type="Edm.String" MaxLength="10" sap:label="Geschäftspartner" />
        <Property Name="SupplierAccountGroup" Type="Edm.String" MaxLength="4" sap:label="Kontengruppe" />
        <Property Name="SupplierFullName" Type="Edm.String" MaxLength="220" sap:label="Name des Kreditors" />
        <Property Name="SupplierName" Type="Edm.String" MaxLength="35" sap:label="Kurzname" />
        <Property Name="PostingIsBlocked" Type="Edm.Boolean" sap:label="Buchungssperre" />
        <Property Name="DeletionIndicator" Type="Edm.Boolean" sap:label="Löschvormerkung" />
      </EntityType>

      <!-- EntityType: A_BusinessPartnerRoleType -->
      <EntityType Name="A_BusinessPartnerRoleType" sap:content-version="1">
        <Key>
          <PropertyRef Name="BusinessPartner" />
          <PropertyRef Name="BusinessPartnerRole" />
        </Key>
        <Property Name="BusinessPartner" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Geschäftspartner" />
        <Property Name="BusinessPartnerRole" Type="Edm.String" Nullable="false" MaxLength="6" sap:label="Rolle" />
        <Property Name="RoleCategory" Type="Edm.String" MaxLength="6" sap:label="Rollentyp" />
        <Property Name="ValidFrom" Type="Edm.DateTime" Precision="0" sap:label="Gültig ab" />
        <Property Name="ValidTo" Type="Edm.DateTime" Precision="0" sap:label="Gültig bis" />
      </EntityType>

      <!-- EntityType: A_BusinessPartnerBankType -->
      <EntityType Name="A_BusinessPartnerBankType" sap:content-version="1">
        <Key>
          <PropertyRef Name="BusinessPartner" />
          <PropertyRef Name="BankIdentification" />
        </Key>
        <Property Name="BusinessPartner" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Geschäftspartner" />
        <Property Name="BankIdentification" Type="Edm.String" Nullable="false" MaxLength="4" sap:label="Bankverbindung" />
        <Property Name="BankCountryKey" Type="Edm.String" MaxLength="3" sap:label="Bankenland" />
        <Property Name="BankNumber" Type="Edm.String" MaxLength="15" sap:label="Bankleitzahl" />
        <Property Name="BankName" Type="Edm.String" MaxLength="60" sap:label="Bankname" />
        <Property Name="IBAN" Type="Edm.String" MaxLength="34" sap:label="IBAN" />
      </EntityType>

      <!-- EntityType: A_AddressEmailAddressType -->
      <EntityType Name="A_AddressEmailAddressType" sap:content-version="1">
        <Key>
          <PropertyRef Name="AddressID" />
          <PropertyRef Name="OrdinalNumber" />
        </Key>
        <Property Name="AddressID" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Adressnummer" />
        <Property Name="Person" Type="Edm.String" MaxLength="10" sap:label="Personennummer" />
        <Property Name="OrdinalNumber" Type="Edm.String" Nullable="false" MaxLength="3" sap:label="Laufende Nummer" />
        <Property Name="IsDefaultEmailAddress" Type="Edm.Boolean" sap:label="Standard-E-Mail" />
        <Property Name="EmailAddress" Type="Edm.String" MaxLength="241" sap:label="E-Mail-Adresse" />
        <Property Name="SearchEmailAddress" Type="Edm.String" MaxLength="20" sap:label="E-Mail Suchfeld" />
      </EntityType>

      <!-- EntityType: A_AddressPhoneNumberType -->
      <EntityType Name="A_AddressPhoneNumberType" sap:content-version="1">
        <Key>
          <PropertyRef Name="AddressID" />
          <PropertyRef Name="OrdinalNumber" />
        </Key>
        <Property Name="AddressID" Type="Edm.String" Nullable="false" MaxLength="10" sap:label="Adressnummer" />
        <Property Name="OrdinalNumber" Type="Edm.String" Nullable="false" MaxLength="3" sap:label="Laufende Nummer" />
        <Property Name="IsDefaultPhoneNumber" Type="Edm.Boolean" sap:label="Standard-Telefon" />
        <Property Name="PhoneNumber" Type="Edm.String" MaxLength="30" sap:label="Telefonnummer" />
      </EntityType>

      <!-- Associations -->
      <Association Name="Assoc_BusinessPartner_to_Address">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerType" Multiplicity="1" Role="From_BusinessPartner" />
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerAddressType" Multiplicity="*" Role="To_Address" />
      </Association>
      <Association Name="Assoc_BusinessPartner_to_Customer">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerType" Multiplicity="1" Role="From_BusinessPartner" />
        <End Type="API_BUSINESS_PARTNER.A_CustomerType" Multiplicity="0..1" Role="To_Customer" />
      </Association>
      <Association Name="Assoc_BusinessPartner_to_Supplier">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerType" Multiplicity="1" Role="From_BusinessPartner" />
        <End Type="API_BUSINESS_PARTNER.A_SupplierType" Multiplicity="0..1" Role="To_Supplier" />
      </Association>
      <Association Name="Assoc_BusinessPartner_to_Role">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerType" Multiplicity="1" Role="From_BusinessPartner" />
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerRoleType" Multiplicity="*" Role="To_Role" />
      </Association>
      <Association Name="Assoc_BusinessPartner_to_Bank">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerType" Multiplicity="1" Role="From_BusinessPartner" />
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerBankType" Multiplicity="*" Role="To_Bank" />
      </Association>
      <Association Name="Assoc_Address_to_Email">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerAddressType" Multiplicity="1" Role="From_Address" />
        <End Type="API_BUSINESS_PARTNER.A_AddressEmailAddressType" Multiplicity="*" Role="To_Email" />
      </Association>
      <Association Name="Assoc_Address_to_Phone">
        <End Type="API_BUSINESS_PARTNER.A_BusinessPartnerAddressType" Multiplicity="1" Role="From_Address" />
        <End Type="API_BUSINESS_PARTNER.A_AddressPhoneNumberType" Multiplicity="*" Role="To_Phone" />
      </Association>

      <!-- EntityContainer -->
      <EntityContainer Name="API_BUSINESS_PARTNER_Entities" m:IsDefaultEntityContainer="true">
        <EntitySet Name="A_BusinessPartner" EntityType="API_BUSINESS_PARTNER.A_BusinessPartnerType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:searchable="true" sap:content-version="1" />
        <EntitySet Name="A_BusinessPartnerAddress" EntityType="API_BUSINESS_PARTNER.A_BusinessPartnerAddressType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
        <EntitySet Name="A_Customer" EntityType="API_BUSINESS_PARTNER.A_CustomerType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
        <EntitySet Name="A_Supplier" EntityType="API_BUSINESS_PARTNER.A_SupplierType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
        <EntitySet Name="A_BusinessPartnerRole" EntityType="API_BUSINESS_PARTNER.A_BusinessPartnerRoleType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
        <EntitySet Name="A_BusinessPartnerBank" EntityType="API_BUSINESS_PARTNER.A_BusinessPartnerBankType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
        <EntitySet Name="A_AddressEmailAddress" EntityType="API_BUSINESS_PARTNER.A_AddressEmailAddressType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
        <EntitySet Name="A_AddressPhoneNumber" EntityType="API_BUSINESS_PARTNER.A_AddressPhoneNumberType" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:content-version="1" />
      </EntityContainer>

    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

  // Helper für OData Response Wrapping
  function wrapResult(items, type, req) {
    const baseUrl = getBaseUrl(req);
    const results = items.map(item => {
      const copy = { ...item };
      let key = item.BusinessPartner || item.Customer || item.Supplier || item.AddressID;
      copy.__metadata = {
        id: `${baseUrl}${BASE_PATH}/${type}('${key}')`,
        uri: `${baseUrl}${BASE_PATH}/${type}('${key}')`,
        type: `API_BUSINESS_PARTNER.${type}Type`
      };
      return copy;
    });
    return { d: { results } };
  }

  function wrapSingle(item, type, req) {
    const baseUrl = getBaseUrl(req);
    const copy = { ...item };
    let key = item.BusinessPartner || item.Customer || item.Supplier || item.AddressID;
    copy.__metadata = {
      id: `${baseUrl}${BASE_PATH}/${type}('${key}')`,
      uri: `${baseUrl}${BASE_PATH}/${type}('${key}')`,
      type: `API_BUSINESS_PARTNER.${type}Type`
    };
    return { d: copy };
  }

  // Helper: Query Filter & Pagination
  function applyQuery(list, req) {
    let result = [...list];
    const { $filter, $top, $skip, $select } = req.query;

    if ($filter) {
      // Unterstützt gängige OData $filter Ausdrücke
      // z.B. BusinessPartnerCategory eq '2' oder Customer eq 'CUST-0010'
      const match = $filter.match(/([a-zA-Z0-9_]+)\s+eq\s+'?([^']+)'?/);
      if (match) {
        const prop = match[1];
        const val = match[2];
        result = result.filter(item => String(item[prop]) === String(val));
      }
    }

    if ($skip) {
      const skipNum = parseInt($skip, 10);
      if (!isNaN(skipNum)) result = result.slice(skipNum);
    }

    if ($top) {
      const topNum = parseInt($top, 10);
      if (!isNaN(topNum)) result = result.slice(0, topNum);
    }

    if ($select) {
      const fields = $select.split(',').map(f => f.trim());
      result = result.map(item => {
        const filtered = {};
        fields.forEach(f => {
          if (item[f] !== undefined) filtered[f] = item[f];
        });
        return filtered;
      });
    }

    return result;
  }

  // Helper zum Extrahieren von Keys aus OData-Keysyntax wie ('1000010') oder (BusinessPartner='1000010')
  function extractKey(raw) {
    if (!raw) return '';
    const m = raw.match(/['"]?([^'")]+)['"]?/);
    return m ? m[1] : raw;
  }

  // =============================================================
  // 3. ROUTEN IMPLEMENTIERUNG
  // =============================================================

  // 3.1 Metadata Endpoint ($metadata)
  const metadataHandler = (req, res) => {
    handleODataRequest(req, res, '$metadata');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(metadataXML);
  };

  app.get(`${BASE_PATH}/\\$metadata`, metadataHandler);
  app.get(`${BASE_PATH}/%24metadata`, metadataHandler);

  // 3.2 Service Root (Katalog aller EntitySets)
  app.get([BASE_PATH, `${BASE_PATH}/`], (req, res) => {
    handleODataRequest(req, res, 'ServiceRoot');
    const isXml = (req.query.$format === 'xml') || (req.headers.accept && req.headers.accept.includes('xml'));
    if (isXml) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.send(`<?xml version="1.0" encoding="utf-8"?>
<service xml:base="${getBaseUrl(req)}${BASE_PATH}/" xmlns="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <workspace>
    <atom:title>Default</atom:title>
    <collection href="A_BusinessPartner"><atom:title>A_BusinessPartner</atom:title></collection>
    <collection href="A_BusinessPartnerAddress"><atom:title>A_BusinessPartnerAddress</atom:title></collection>
    <collection href="A_Customer"><atom:title>A_Customer</atom:title></collection>
    <collection href="A_Supplier"><atom:title>A_Supplier</atom:title></collection>
    <collection href="A_BusinessPartnerRole"><atom:title>A_BusinessPartnerRole</atom:title></collection>
    <collection href="A_BusinessPartnerBank"><atom:title>A_BusinessPartnerBank</atom:title></collection>
    <collection href="A_AddressEmailAddress"><atom:title>A_AddressEmailAddress</atom:title></collection>
    <collection href="A_AddressPhoneNumber"><atom:title>A_AddressPhoneNumber</atom:title></collection>
  </workspace>
</service>`);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      d: {
        EntitySets: [
          "A_BusinessPartner",
          "A_BusinessPartnerAddress",
          "A_Customer",
          "A_Supplier",
          "A_BusinessPartnerRole",
          "A_BusinessPartnerBank",
          "A_AddressEmailAddress",
          "A_AddressPhoneNumber"
        ]
      }
    });
  });

  // 3.3 A_BusinessPartner (List & Query)
  app.get(`${BASE_PATH}/A_BusinessPartner`, (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartner');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(businessPartners, req);
    res.json(wrapResult(filtered, 'A_BusinessPartner', req));
  });

  // 3.3b A_BusinessPartner/$count
  app.get([`${BASE_PATH}/A_BusinessPartner/\\$count`, `${BASE_PATH}/A_BusinessPartner/%24count`], (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartner/$count');
    const filtered = applyQuery(businessPartners, req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.method === 'HEAD') return res.status(200).end();
    res.send(String(filtered.length));
  });

  // 3.3c A_BusinessPartnerAddress/$count
  app.get([`${BASE_PATH}/A_BusinessPartnerAddress/\\$count`, `${BASE_PATH}/A_BusinessPartnerAddress/%24count`], (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartnerAddress/$count');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.method === 'HEAD') return res.status(200).end();
    res.send(String(addresses.length));
  });

  // 3.4 A_BusinessPartner Single Entity: z.B. /A_BusinessPartner('1000010')
  app.get(`${BASE_PATH}/A_BusinessPartner\\(:key\\)`, (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartner(Key)');
    const bpId = extractKey(req.params.key);
    const bp = businessPartners.find(b => b.BusinessPartner === bpId);
    if (!bp) {
      return res.status(404).json({ error: { code: "404", message: { value: `Geschäftspartner '${bpId}' nicht gefunden.` } } });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(wrapSingle(bp, 'A_BusinessPartner', req));
  });

  // 3.5 Navigation: A_BusinessPartner('1000010')/to_BusinessPartnerAddress
  app.get(`${BASE_PATH}/A_BusinessPartner\\(:key\\)/to_BusinessPartnerAddress`, (req, res) => {
    handleODataRequest(req, res, 'to_BusinessPartnerAddress');
    const bpId = extractKey(req.params.key);
    const related = addresses.filter(a => a.BusinessPartner === bpId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(wrapResult(related, 'A_BusinessPartnerAddress', req));
  });

  // 3.6 Navigation: A_BusinessPartner('1000010')/to_Customer
  app.get(`${BASE_PATH}/A_BusinessPartner\\(:key\\)/to_Customer`, (req, res) => {
    handleODataRequest(req, res, 'to_Customer');
    const bpId = extractKey(req.params.key);
    const cust = customers.find(c => c.BusinessPartner === bpId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!cust) {
      return res.status(404).json({ error: { code: "404", message: { value: "Kein zugeordneter Debitor." } } });
    }
    res.json(wrapSingle(cust, 'A_Customer', req));
  });

  // 3.7 Navigation: A_BusinessPartner('1000010')/to_Supplier
  app.get(`${BASE_PATH}/A_BusinessPartner\\(:key\\)/to_Supplier`, (req, res) => {
    handleODataRequest(req, res, 'to_Supplier');
    const bpId = extractKey(req.params.key);
    const supp = suppliers.find(s => s.BusinessPartner === bpId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!supp) {
      return res.status(404).json({ error: { code: "404", message: { value: "Kein zugeordneter Kreditor." } } });
    }
    res.json(wrapSingle(supp, 'A_Supplier', req));
  });

  // 3.8 Navigation: A_BusinessPartner('1000010')/to_BusinessPartnerRole
  app.get(`${BASE_PATH}/A_BusinessPartner\\(:key\\)/to_BusinessPartnerRole`, (req, res) => {
    handleODataRequest(req, res, 'to_BusinessPartnerRole');
    const bpId = extractKey(req.params.key);
    const related = roles.filter(r => r.BusinessPartner === bpId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(wrapResult(related, 'A_BusinessPartnerRole', req));
  });

  // 3.9 Navigation: A_BusinessPartner('1000010')/to_BusinessPartnerBank
  app.get(`${BASE_PATH}/A_BusinessPartner\\(:key\\)/to_BusinessPartnerBank`, (req, res) => {
    handleODataRequest(req, res, 'to_BusinessPartnerBank');
    const bpId = extractKey(req.params.key);
    const related = banks.filter(b => b.BusinessPartner === bpId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(wrapResult(related, 'A_BusinessPartnerBank', req));
  });

  // 3.10 A_BusinessPartnerAddress (List & Query)
  app.get(`${BASE_PATH}/A_BusinessPartnerAddress`, (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartnerAddress');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(addresses, req);
    res.json(wrapResult(filtered, 'A_BusinessPartnerAddress', req));
  });

  // 3.11 A_Customer (List & Query)
  app.get(`${BASE_PATH}/A_Customer`, (req, res) => {
    handleODataRequest(req, res, 'A_Customer');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(customers, req);
    res.json(wrapResult(filtered, 'A_Customer', req));
  });

  // 3.12 A_Customer Single Entity
  app.get(`${BASE_PATH}/A_Customer\\(:key\\)`, (req, res) => {
    handleODataRequest(req, res, 'A_Customer(Key)');
    const custId = extractKey(req.params.key);
    const cust = customers.find(c => c.Customer === custId);
    if (!cust) {
      return res.status(404).json({ error: { code: "404", message: { value: `Kunde '${custId}' nicht gefunden.` } } });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(wrapSingle(cust, 'A_Customer', req));
  });

  // 3.13 A_Supplier (List & Query)
  app.get(`${BASE_PATH}/A_Supplier`, (req, res) => {
    handleODataRequest(req, res, 'A_Supplier');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(suppliers, req);
    res.json(wrapResult(filtered, 'A_Supplier', req));
  });

  // 3.14 A_Supplier Single Entity
  app.get(`${BASE_PATH}/A_Supplier\\(:key\\)`, (req, res) => {
    handleODataRequest(req, res, 'A_Supplier(Key)');
    const suppId = extractKey(req.params.key);
    const supp = suppliers.find(s => s.Supplier === suppId);
    if (!supp) {
      return res.status(404).json({ error: { code: "404", message: { value: `Lieferant '${suppId}' nicht gefunden.` } } });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(wrapSingle(supp, 'A_Supplier', req));
  });

  // 3.15 A_BusinessPartnerRole (List & Query)
  app.get(`${BASE_PATH}/A_BusinessPartnerRole`, (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartnerRole');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(roles, req);
    res.json(wrapResult(filtered, 'A_BusinessPartnerRole', req));
  });

  // 3.16 A_BusinessPartnerBank (List & Query)
  app.get(`${BASE_PATH}/A_BusinessPartnerBank`, (req, res) => {
    handleODataRequest(req, res, 'A_BusinessPartnerBank');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(banks, req);
    res.json(wrapResult(filtered, 'A_BusinessPartnerBank', req));
  });

  // 3.17 A_AddressEmailAddress (List & Query)
  app.get(`${BASE_PATH}/A_AddressEmailAddress`, (req, res) => {
    handleODataRequest(req, res, 'A_AddressEmailAddress');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(emails, req);
    res.json(wrapResult(filtered, 'A_AddressEmailAddress', req));
  });

  // 3.18 A_AddressPhoneNumber (List & Query)
  app.get(`${BASE_PATH}/A_AddressPhoneNumber`, (req, res) => {
    handleODataRequest(req, res, 'A_AddressPhoneNumber');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const filtered = applyQuery(phones, req);
    res.json(wrapResult(filtered, 'A_AddressPhoneNumber', req));
  });

  // Exponiere Referenz auf Daten falls nötig
  return {
    businessPartners,
    addresses,
    customers,
    suppliers,
    roles,
    banks,
    emails,
    phones,
    metadataXML
  };
};
