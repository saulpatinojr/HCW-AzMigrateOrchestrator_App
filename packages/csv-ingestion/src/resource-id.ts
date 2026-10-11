import type { ParsedResourceId } from "@amo/domain";

/**
 * Parse an Azure resource ID:
 * /subscriptions/{sub}/resourceGroups/{rg}/providers/{ns}/{type}/{name}[/{childType}/{childName}...]
 */
export function parseResourceId(id: string | null | undefined): ParsedResourceId {
  const issues: string[] = [];
  if (!id || typeof id !== "string") return { valid: false, issues: ["missing resource id"] };
  const trimmed = id.trim();
  if (!trimmed.startsWith("/")) issues.push("resource id must start with '/'");
  const segs = trimmed.split("/").filter(Boolean);
  const out: ParsedResourceId = { valid: false, issues };
  const lower = segs.map((s) => s.toLowerCase());
  const subIdx = lower.indexOf("subscriptions");
  if (subIdx !== -1 && segs[subIdx + 1]) {
    out.subscriptionId = segs[subIdx + 1];
    if (!/^[0-9a-f-]{36}$/i.test(out.subscriptionId)) issues.push("subscription id is not a GUID");
  } else issues.push("no /subscriptions/{id} segment");
  const rgIdx = lower.indexOf("resourcegroups");
  if (rgIdx !== -1 && segs[rgIdx + 1]) out.resourceGroup = segs[rgIdx + 1];
  const provIdx = lower.indexOf("providers");
  if (provIdx !== -1 && segs[provIdx + 1]) {
    out.provider = segs[provIdx + 1];
    const rest = segs.slice(provIdx + 2);
    if (rest.length < 2) issues.push("provider segment lacks type/name");
    else {
      const typeSegs: string[] = [];
      let lastName = "";
      for (let i = 0; i < rest.length; i += 2) {
        typeSegs.push(rest[i]);
        lastName = rest[i + 1] ?? "";
      }
      if (rest.length % 2 !== 0) issues.push("unbalanced type/name segments");
      out.typePath = typeSegs.join("/");
      out.fullType = `${out.provider}/${out.typePath}`;
      out.name = lastName;
      if (typeSegs.length > 1) out.parentId = "/" + segs.slice(0, provIdx + 2 + (typeSegs.length - 1) * 2).join("/");
    }
  } else if (subIdx !== -1 && rgIdx !== -1 && segs.length === rgIdx + 2) {
    out.provider = "Microsoft.Resources";
    out.typePath = "resourceGroups";
    out.fullType = "Microsoft.Resources/resourceGroups";
    out.name = out.resourceGroup;
  } else issues.push("no /providers/ segment");
  out.valid = issues.length === 0 && !!out.fullType;
  return out;
}

/**
 * Recover an Azure resource ID from a portal "Resource link" cell. The portal's "All resources" export carries no Resource ID
 * column by default but every row links to the resource as `https://portal.azure.com#resource/subscriptions/...` or
 * `https://portal.azure.com/#@{tenant}/resource/subscriptions/...`. Returns the `/subscriptions/...` path, or null when the
 * cell is not such a link. Percent-encoding is decoded; a cell that is already a bare resource ID is returned as is.
 */
export function resourceIdFromPortalLink(link: string | null | undefined): string | null {
  if (!link || typeof link !== "string") return null;
  const s = link.trim();
  if (s.startsWith("/subscriptions/")) return s;
  const m = /(?:#|\/)(?:@[^/]+\/)?resource(\/subscriptions\/.+)$/i.exec(s);
  if (!m) return null;
  let path = m[1];
  try { path = decodeURIComponent(path); } catch { /* keep the raw path; parseResourceId reports what it cannot read */ }
  return path.replace(/[?#].*$/, "").replace(/\/+$/, "");
}
