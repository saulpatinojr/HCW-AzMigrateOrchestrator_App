import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Assessment, MigrationIntent, ProgressEvent, ResourceDecisionRecord } from "@amo/domain";
import { LabApiClient, LabApiError } from "../client.js";
import { UploadStep } from "./UploadStep.js";
import { QuestionnaireForm } from "./QuestionnaireForm.js";
import { ProgressList } from "./ProgressList.js";
import { SummaryPanel } from "./SummaryPanel.js";
import { DecisionTable } from "./DecisionTable.js";
import { DecisionDetail } from "./DecisionDetail.js";
import { WavePlanView } from "./WavePlanView.js";
import { GeneratedFiles } from "./GeneratedFiles.js";
import { PoweredBy } from "./PoweredBy.js";

export type Stage = "upload" | "questions" | "running" | "results";

export interface MigrationExplorerProps {
  /** Base URL of the lab API, never the appliance. Default "" (same origin): the pane app is served by the lab API itself. */
  apiBaseUrl?: string;
  /** Rendered inside the upload step. The pane app that mounts the explorer (downstream apps/lab-web, same origin as the lab API)
   *  owns the Turnstile script, renders the widget into this node with the site key from /api/health, and passes the token via
   *  getTurnstileToken. The website is a cross-origin sandboxed frame host and can inject nothing into the pane. */
  turnstile?: React.ReactNode;
  getTurnstileToken?: () => string | undefined;
  /** Where the enterprise CTA links when no host handles navigation. */
  contactUrl?: string;
  /** Site path handed to onNavigate when the host handles navigation. A literal chosen by the host, never read from the API. */
  contactPath?: string;
  /** Render the partner panel. The HCW site pane passes false: vendor names are not visitor copy there. */
  partners?: boolean;
  /** Render the enterprise CTA on the results stage. */
  cta?: boolean;
  /** Called after every stage change from a client effect; never during server rendering. */
  onStageChange?: (stage: Stage) => void;
  /** When set, the CTA is a button that hands contactPath to the host instead of navigating inside the frame. */
  onNavigate?: (path: string) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Client-only island: no window access or fetch at module evaluation, so it is safe inside the site's prerender.
 * Mount it lazily (React.lazy) from the route component.
 */
export function MigrationExplorer({ apiBaseUrl = "", turnstile, getTurnstileToken, contactUrl = "https://hybridcloudworks.com/contact", contactPath = "/contact", partners = true, cta = true, onStageChange, onNavigate, fetchImpl }: MigrationExplorerProps) {
  const client = useMemo(() => new LabApiClient({ baseUrl: apiBaseUrl, fetchImpl }), [apiBaseUrl, fetchImpl]);
  const [stage, setStage] = useState<Stage>("upload");
  const [csv, setCsv] = useState<{ text: string; name: string } | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceAvailable, setWorkspaceAvailable] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  // Notify on stage transitions only. The callback is read through a ref so an inline handler from the parent
  // (a new function identity on every parent render) never re-fires the effect; the dependency list is [stage] alone.
  const onStageChangeRef = useRef(onStageChange);
  onStageChangeRef.current = onStageChange;
  useEffect(() => { onStageChangeRef.current?.(stage); }, [stage]);
  useEffect(() => {
    let cancelled = false;
    client.health().then((h) => { if (!cancelled) setWorkspaceAvailable(!!h.workspace && h.workspace !== "disabled"); }).catch(() => {});
    return () => { cancelled = true; };
  }, [client]);
  const openWorkspace = async () => {
    setWorkspaceBusy(true);
    try {
      const ws = await client.openWorkspace();
      if (ws.launchUrl) window.open(ws.launchUrl, "_blank", "noopener");
    } catch (e) { setError((e as Error).message); } finally { setWorkspaceBusy(false); }
  };

  const onFile = useCallback((text: string, name: string) => { setCsv({ text, name }); setStage("questions"); }, []);

  const run = async (intent: Partial<MigrationIntent>) => {
    if (!csv) return;
    setError(null);
    setStage("running");
    setEvents([]);
    try {
      const created = await client.create({ csv: csv.text, fileName: csv.name, intent }, getTurnstileToken?.());
      setEvents(created.progress);
      setExpiresAt(created.expiresAt);
      const full = await client.get();
      setAssessment(full.assessment as Assessment);
      setFiles(full.files);
      setStage("results");
    } catch (e) {
      const msg = e instanceof LabApiError ? `${e.message}${e.body?.error.details ? ` — ${JSON.stringify(e.body.error.details)}` : ""}` : (e as Error).message;
      setError(msg);
      setStage("questions");
    }
  };

  const download = async () => {
    const blob = await client.bundle();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assessment-${client.id?.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const remove = async () => {
    if (!confirm("Delete this assessment and its data now?")) return;
    await client.delete();
    setAssessment(null);
    setFiles([]);
    setStage("upload");
    setCsv(null);
  };

  return (
    <div className="space-y-8" data-component="migration-explorer">
      <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-100">
        <strong>What this lab is — and is not.</strong> It analyses an exported inventory only. It never connects to an Azure tenant, never asks for credentials, and cannot execute migration actions. Results are rule-based illustrations labelled with their evidence state and confidence; they are not an authoritative Azure assessment. Uploads are processed in memory and expire automatically.
      </div>
      <UploadStep sampleUrl={`${apiBaseUrl}/api/sample.csv`} onFile={onFile} turnstile={turnstile} />
      {stage !== "upload" && <QuestionnaireForm onSubmit={run} busy={stage === "running"} />}
      {error && <p role="alert" className="rounded-lg border border-red-700 p-3 text-sm text-red-700">Assessment failed: {error}</p>}
      {(stage === "running" || stage === "results") && <ProgressList events={events} pending={stage === "running"} />}
      {stage === "results" && assessment && <ResultsStage assessment={assessment} expiresAt={expiresAt} files={files} loadFile={(p) => client.file(p)} onDownload={download} onDelete={remove} onOpenWorkspace={workspaceAvailable ? openWorkspace : undefined} workspaceBusy={workspaceBusy} cta={cta} contactUrl={contactUrl} contactPath={contactPath} onNavigate={onNavigate} />}
      {partners && <PoweredBy compact={stage !== "results"} />}
    </div>
  );
}

export interface ResultsStageProps {
  assessment: Assessment; expiresAt: string | null; files: string[]; loadFile: (path: string) => Promise<string>;
  onDownload: () => void; onDelete: () => void; onOpenWorkspace?: () => void; workspaceBusy?: boolean;
  cta?: boolean; contactUrl: string; contactPath: string; onNavigate?: (path: string) => void;
}

/** The results stage on its own, so the results markup can be rendered without driving an upload. Owns the decision selection. */
export function ResultsStage({ assessment, expiresAt, files, loadFile, onDownload, onDelete, onOpenWorkspace, workspaceBusy, cta = true, contactUrl, contactPath, onNavigate }: ResultsStageProps) {
  const [selected, setSelected] = useState<ResourceDecisionRecord | null>(null);
  return (
    <>
      <SummaryPanel summary={assessment.summary} expiresAt={expiresAt} onDownload={onDownload} onDelete={onDelete} onOpenWorkspace={onOpenWorkspace} workspaceBusy={workspaceBusy} />
      <DecisionTable decisions={assessment.decisions} onSelect={setSelected} />
      <DecisionDetail decision={selected} onClose={() => setSelected(null)} />
      <WavePlanView plan={assessment.wavePlan} decisions={assessment.decisions} />
      <GeneratedFiles files={files} load={loadFile} />
      {cta && <EnterpriseCta contactUrl={contactUrl} contactPath={contactPath} onNavigate={onNavigate} />}
    </>
  );
}

export interface EnterpriseCtaProps { contactUrl: string; contactPath: string; onNavigate?: (path: string) => void }

/** Enterprise CTA. With onNavigate set it is a button that hands contactPath to the host (a sandboxed frame cannot navigate the site itself). */
export function EnterpriseCta({ contactUrl, contactPath, onNavigate }: EnterpriseCtaProps) {
  const cls = "mt-3 inline-block rounded-lg bg-sky-700 px-4 py-2 text-white";
  return (
    <section className="rounded-xl border p-6 text-center">
      <h2 className="text-lg font-semibold">Need an assessment you can act on?</h2>
      <p className="text-sm">The <strong>Azure Migration Orchestrator</strong> appliance connects read-only to your tenant with Microsoft Entra ID, validates every rule against live configuration, and carries each resource through approval-gated migration waves.</p>
      {onNavigate
        ? <button type="button" className={cls} onClick={() => onNavigate(contactPath)}>Talk to Hybrid Cloud Works</button>
        : <a className={cls} href={contactUrl}>Talk to Hybrid Cloud Works</a>}
    </section>
  );
}
