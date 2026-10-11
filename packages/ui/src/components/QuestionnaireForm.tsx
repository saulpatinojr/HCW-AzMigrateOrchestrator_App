import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { MigrationIntent } from "@amo/domain";
import { AZURE_REGIONS, regionId } from "../regions.js";

export interface QuestionnaireFormProps {
  onSubmit: (intent: Partial<MigrationIntent>) => void;
  busy?: boolean;
  /** LOCATION values of the uploaded export (display or ARM names), shown beside the destination choice. */
  sourceLocations?: string[];
}

const OPS: Array<[MigrationIntent["desiredOperation"], string]> = [
  ["region-relocation", "Move to another region"],
  ["resource-group-move", "Move to another resource group"],
  ["subscription-move", "Move to another subscription (same tenant)"],
  ["cross-tenant-migration", "Migrate to another Microsoft Entra tenant"],
];
/** Sentinel select value that reveals the free-text region field. Never a valid ARM location name. */
export const OTHER_REGION = "other";
const tri = (v: string): boolean | null => (v === "" ? null : v === "true");

type Change = ChangeEvent<HTMLInputElement | HTMLSelectElement>;
const FIELD = "rounded-lg border px-2 py-1";

/*
 * The field components are module-level so their identity is stable across renders. Defining them inside the form
 * (as this file once did) hands React a new component type on every keystroke, which unmounts and remounts the input
 * and drops focus after each character.
 */
function Sel({ label, value, onChange, children }: { label: string; value: string; onChange: (e: Change) => void; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm">{label}<select className={FIELD} value={value} onChange={onChange}>{children}</select></label>;
}
function Txt({ label, value, onChange, type = "text", placeholder, min }: { label: string; value: string; onChange: (e: Change) => void; type?: string; placeholder?: string; min?: number }) {
  return <label className="flex flex-col gap-1 text-sm">{label}<input className={FIELD} type={type} value={value} placeholder={placeholder} min={min} onChange={onChange} /></label>;
}
const NOT_SURE = <option value="">Not sure</option>;

const DEFAULTS: Record<string, string> = { desiredOperation: "region-relocation", destinationRegion: "", destinationRegionOther: "", applicationGroupTagKey: "application", includeDataMigrationExamples: "true" };

/** Only questions that change the analysis; skipped answers become labelled assumptions server-side. */
export function QuestionnaireForm({ onSubmit, busy, sourceLocations = [] }: QuestionnaireFormProps) {
  const [f, setF] = useState<Record<string, string>>(DEFAULTS);
  const set = (k: string) => (e: Change) => {
    const v = e.target.type === "checkbox" ? String((e.target as HTMLInputElement).checked) : e.target.value;
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const v = (k: string) => f[k] ?? "";
  const sourceRegionIds = new Set(sourceLocations.map(regionId).filter((r): r is string => r !== null));
  const sourceLabel = sourceLocations.length ? `This export is in: ${sourceLocations.join(", ")}.` : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const region = f.destinationRegion === OTHER_REGION ? f.destinationRegionOther?.trim() : f.destinationRegion;
    const intent: Partial<MigrationIntent> = {
      desiredOperation: f.desiredOperation as MigrationIntent["desiredOperation"],
      destinationRegion: region || null,
      destinationSubscriptionId: f.destinationSubscriptionId?.trim() || null,
      destinationResourceGroup: f.destinationResourceGroup?.trim() || null,
      sameSubscription: tri(f.sameSubscription ?? ""),
      sameTenant: tri(f.sameTenant ?? ""),
      existingLandingZone: tri(f.existingLandingZone ?? ""),
      environmentType: (f.environmentType as MigrationIntent["environmentType"]) || null,
      downtimeTolerance: (f.downtimeTolerance as MigrationIntent["downtimeTolerance"]) || null,
      rtoHours: f.rtoHours ? Number(f.rtoHours) : null,
      rpoMinutes: f.rpoMinutes ? Number(f.rpoMinutes) : null,
      migrationMode: (f.migrationMode as MigrationIntent["migrationMode"]) || null,
      dataResidency: f.dataResidency?.trim() || null,
      publicAccessPolicy: (f.publicAccessPolicy as MigrationIntent["publicAccessPolicy"]) || null,
      privateEndpointsRequired: tri(f.privateEndpointsRequired ?? ""),
      applicationGroupTagKey: f.applicationGroupTagKey?.trim() || null,
      includeDataMigrationExamples: f.includeDataMigrationExamples === "true",
    };
    onSubmit(intent);
  };
  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Migration questionnaire">
      <h2 className="text-lg font-semibold">2. A few questions</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">Only answers that change the analysis. Anything you skip is recorded as an assumption in the report.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Sel label="Destination region" value={v("destinationRegion")} onChange={set("destinationRegion")}>
            {NOT_SURE}
            {AZURE_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.id}){sourceRegionIds.has(r.id) ? " — current" : ""}</option>)}
            <option value={OTHER_REGION}>Other (type it)</option>
          </Sel>
          {f.destinationRegion === OTHER_REGION && <Txt label="Region name as Azure spells it" value={v("destinationRegionOther")} onChange={set("destinationRegionOther")} placeholder="e.g. westus3" />}
          {sourceLabel && <span className="text-xs text-slate-500">{sourceLabel}</span>}
        </div>
        <Txt label="Destination subscription ID (optional, for Terraform state impact)" value={v("destinationSubscriptionId")} onChange={set("destinationSubscriptionId")} placeholder="00000000-…" />
        <Txt label="Destination resource group (optional)" value={v("destinationResourceGroup")} onChange={set("destinationResourceGroup")} placeholder="rg-app-prod-wus3-01" />
        <Sel label="Operation" value={v("desiredOperation")} onChange={set("desiredOperation")}>{OPS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Sel>
        <Sel label="Same subscription?" value={v("sameSubscription")} onChange={set("sameSubscription")}>{NOT_SURE}<option value="true">Yes</option><option value="false">No</option></Sel>
        <Sel label="Same tenant?" value={v("sameTenant")} onChange={set("sameTenant")}>{NOT_SURE}<option value="true">Yes</option><option value="false">No</option></Sel>
        <Sel label="Existing landing zone?" value={v("existingLandingZone")} onChange={set("existingLandingZone")}>{NOT_SURE}<option value="true">Yes</option><option value="false">No, greenfield</option></Sel>
        <Sel label="Environment" value={v("environmentType")} onChange={set("environmentType")}>{NOT_SURE}<option value="production">Production</option><option value="non-production">Non-production</option><option value="mixed">Mixed</option></Sel>
        <Sel label="Downtime tolerance" value={v("downtimeTolerance")} onChange={set("downtimeTolerance")}>{NOT_SURE}<option value="none">None</option><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></Sel>
        <Txt label="RTO (hours)" value={v("rtoHours")} onChange={set("rtoHours")} type="number" min={0} />
        <Txt label="RPO (minutes)" value={v("rpoMinutes")} onChange={set("rpoMinutes")} type="number" min={0} />
        <Sel label="Migration mode" value={v("migrationMode")} onChange={set("migrationMode")}><option value="">Either</option><option value="online">Online</option><option value="offline">Offline</option></Sel>
        <Txt label="Data residency constraint" value={v("dataResidency")} onChange={set("dataResidency")} placeholder="e.g. EU only" />
        <Sel label="Public access policy" value={v("publicAccessPolicy")} onChange={set("publicAccessPolicy")}><option value="">Unknown</option><option value="allow">Allow</option><option value="deny">Deny</option></Sel>
        <Sel label="Private endpoints required?" value={v("privateEndpointsRequired")} onChange={set("privateEndpointsRequired")}>{NOT_SURE}<option value="true">Yes</option><option value="false">No</option></Sel>
        <Txt label="Tag that groups applications" value={v("applicationGroupTagKey")} onChange={set("applicationGroupTagKey")} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.includeDataMigrationExamples === "true"} onChange={set("includeDataMigrationExamples")} /> Include data-migration examples</label>
      </div>
      <p className="text-xs text-slate-500">We never ask for passwords, client secrets, tokens, storage keys, connection strings or certificates.</p>
      <button type="submit" disabled={busy} className="rounded-lg bg-sky-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "Running…" : "Run assessment"}</button>
    </form>
  );
}
