/**
 * Azure public regions offered as destination choices. `id` is the ARM location name, which is what the engine compares
 * (`NormalizedResource.location` is the export's LOCATION lower-cased without spaces, so "Central US" and "centralus" meet).
 * Data only: the list is a convenience for the questionnaire and does not gate the analysis; a region not listed here is
 * entered as free text. Retrieved from the Azure geographies page on 2026-10-11 [VERIFY]; sovereign and restricted-access
 * regions are omitted on purpose.
 */
export interface AzureRegion { id: string; name: string; geography: string }

export const AZURE_REGIONS: readonly AzureRegion[] = [
  { id: "eastus", name: "East US", geography: "United States" },
  { id: "eastus2", name: "East US 2", geography: "United States" },
  { id: "centralus", name: "Central US", geography: "United States" },
  { id: "northcentralus", name: "North Central US", geography: "United States" },
  { id: "southcentralus", name: "South Central US", geography: "United States" },
  { id: "westcentralus", name: "West Central US", geography: "United States" },
  { id: "westus", name: "West US", geography: "United States" },
  { id: "westus2", name: "West US 2", geography: "United States" },
  { id: "westus3", name: "West US 3", geography: "United States" },
  { id: "canadacentral", name: "Canada Central", geography: "Canada" },
  { id: "canadaeast", name: "Canada East", geography: "Canada" },
  { id: "mexicocentral", name: "Mexico Central", geography: "Mexico" },
  { id: "brazilsouth", name: "Brazil South", geography: "Brazil" },
  { id: "brazilsoutheast", name: "Brazil Southeast", geography: "Brazil" },
  { id: "chilecentral", name: "Chile Central", geography: "Chile" },
  { id: "northeurope", name: "North Europe", geography: "Europe" },
  { id: "westeurope", name: "West Europe", geography: "Europe" },
  { id: "uksouth", name: "UK South", geography: "United Kingdom" },
  { id: "ukwest", name: "UK West", geography: "United Kingdom" },
  { id: "francecentral", name: "France Central", geography: "France" },
  { id: "francesouth", name: "France South", geography: "France" },
  { id: "germanywestcentral", name: "Germany West Central", geography: "Germany" },
  { id: "germanynorth", name: "Germany North", geography: "Germany" },
  { id: "switzerlandnorth", name: "Switzerland North", geography: "Switzerland" },
  { id: "switzerlandwest", name: "Switzerland West", geography: "Switzerland" },
  { id: "norwayeast", name: "Norway East", geography: "Norway" },
  { id: "norwaywest", name: "Norway West", geography: "Norway" },
  { id: "swedencentral", name: "Sweden Central", geography: "Sweden" },
  { id: "polandcentral", name: "Poland Central", geography: "Poland" },
  { id: "italynorth", name: "Italy North", geography: "Italy" },
  { id: "spaincentral", name: "Spain Central", geography: "Spain" },
  { id: "austriaeast", name: "Austria East", geography: "Austria" },
  { id: "belgiumcentral", name: "Belgium Central", geography: "Belgium" },
  { id: "uaenorth", name: "UAE North", geography: "United Arab Emirates" },
  { id: "uaecentral", name: "UAE Central", geography: "United Arab Emirates" },
  { id: "qatarcentral", name: "Qatar Central", geography: "Qatar" },
  { id: "israelcentral", name: "Israel Central", geography: "Israel" },
  { id: "southafricanorth", name: "South Africa North", geography: "South Africa" },
  { id: "southafricawest", name: "South Africa West", geography: "South Africa" },
  { id: "centralindia", name: "Central India", geography: "India" },
  { id: "southindia", name: "South India", geography: "India" },
  { id: "westindia", name: "West India", geography: "India" },
  { id: "eastasia", name: "East Asia", geography: "Asia Pacific" },
  { id: "southeastasia", name: "Southeast Asia", geography: "Asia Pacific" },
  { id: "indonesiacentral", name: "Indonesia Central", geography: "Indonesia" },
  { id: "malaysiawest", name: "Malaysia West", geography: "Malaysia" },
  { id: "japaneast", name: "Japan East", geography: "Japan" },
  { id: "japanwest", name: "Japan West", geography: "Japan" },
  { id: "koreacentral", name: "Korea Central", geography: "Korea" },
  { id: "koreasouth", name: "Korea South", geography: "Korea" },
  { id: "australiaeast", name: "Australia East", geography: "Australia" },
  { id: "australiasoutheast", name: "Australia Southeast", geography: "Australia" },
  { id: "australiacentral", name: "Australia Central", geography: "Australia" },
  { id: "australiacentral2", name: "Australia Central 2", geography: "Australia" },
  { id: "newzealandnorth", name: "New Zealand North", geography: "New Zealand" },
];

/** ARM location name for a display name or location name ("Central US" and "centralus" both give "centralus"); null when unknown. */
export function regionId(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, "");
  return AZURE_REGIONS.find((r) => r.id === key || r.name.toLowerCase().replace(/\s+/g, "") === key)?.id ?? null;
}
