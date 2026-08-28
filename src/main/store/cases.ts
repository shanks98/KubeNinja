import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Case, CaseDetail, CaseSummary, Comment, Evidence, EvidenceKind, Finding,
  FindingStatus, Severity, TimelineItem,
} from '@shared/types';
import { SEVERITIES } from '@shared/types';
import { db } from './db';
import { rollup, SEV_RANK } from './rollup';

const now = () => Date.now();

function addEvent(caseId: string, type: string, text: string): void {
  db.get().events.push({ id: randomUUID(), caseId, ts: now(), type, text });
}

function touch(c: Case): void { c.updatedAt = now(); }

export const cases = {
  list(): CaseSummary[] {
    const d = db.get();
    return d.cases
      .map((c) => {
        const fs = d.findings.filter((f) => f.caseId === c.id);
        return { ...c, rollup: rollup(fs), findingCount: fs.length };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  create(input: { title: string; description?: string; cluster?: string }): Case {
    const c: Case = { id: randomUUID(), title: input.title.trim() || 'Untitled case', description: input.description, status: 'open', cluster: input.cluster, createdAt: now(), updatedAt: now() };
    db.get().cases.unshift(c);
    addEvent(c.id, 'created', `Case created${c.cluster ? ` for ${c.cluster}` : ''}`);
    db.save();
    return c;
  },

  update(id: string, patch: Partial<Pick<Case, 'title' | 'description' | 'status'>>): Case {
    const c = db.get().cases.find((x) => x.id === id);
    if (!c) throw new Error('case not found');
    if (patch.status && patch.status !== c.status) addEvent(id, 'status', `Case ${patch.status}`);
    Object.assign(c, patch);
    touch(c);
    db.save();
    return c;
  },

  remove(id: string): void {
    const d = db.get();
    for (const e of d.evidence.filter((e) => e.caseId === id)) this.deleteBlob(e);
    d.cases = d.cases.filter((c) => c.id !== id);
    d.findings = d.findings.filter((f) => f.caseId !== id);
    d.comments = d.comments.filter((c) => c.caseId !== id);
    d.evidence = d.evidence.filter((e) => e.caseId !== id);
    d.events = d.events.filter((e) => e.caseId !== id);
    db.save();
  },

  get(id: string): CaseDetail {
    const d = db.get();
    const c = d.cases.find((x) => x.id === id);
    if (!c) throw new Error('case not found');
    const findings = d.findings.filter((f) => f.caseId === id)
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.createdAt - a.createdAt);
    const comments = d.comments.filter((x) => x.caseId === id);
    const evidence = d.evidence.filter((e) => e.caseId === id).sort((a, b) => b.createdAt - a.createdAt);
    return { case: c, findings, comments, evidence, timeline: this.timeline(id), rollup: rollup(findings) };
  },

  timeline(id: string): TimelineItem[] {
    const d = db.get();
    const c = d.cases.find((x) => x.id === id);
    const items: TimelineItem[] = [];
    for (const e of d.events.filter((e) => e.caseId === id)) items.push({ ts: e.ts, kind: 'event', text: e.text });
    // Fold in the audit log for this case's cluster (or all, if the case has none).
    for (const a of d.actionLog) {
      if (c?.cluster && a.cluster !== c.cluster) continue;
      items.push({ ts: a.ts, kind: 'action', verb: a.verb, ok: a.ok, text: `${a.verb} ${a.kind}/${a.name}${a.namespace ? ` · ${a.namespace}` : ''}${a.detail ? ` · ${a.detail}` : ''}${a.error ? ` — ${a.error}` : ''}` });
    }
    return items.sort((a, b) => b.ts - a.ts);
  },

  addFinding(caseId: string, input: { title: string; severity: Severity; status?: FindingStatus; detail?: string; resource?: string }): Finding {
    const f: Finding = { id: randomUUID(), caseId, title: input.title.trim(), severity: input.severity, status: input.status ?? 'open', detail: input.detail, resource: input.resource, createdAt: now(), updatedAt: now() };
    db.get().findings.push(f);
    addEvent(caseId, 'finding', `Finding added: [${f.severity}] ${f.title}`);
    const c = db.get().cases.find((x) => x.id === caseId); if (c) touch(c);
    db.save();
    return f;
  },

  updateFinding(id: string, patch: Partial<Pick<Finding, 'title' | 'severity' | 'status' | 'detail'>>): Finding {
    const f = db.get().findings.find((x) => x.id === id);
    if (!f) throw new Error('finding not found');
    if (patch.status && patch.status !== f.status) addEvent(f.caseId, 'finding', `"${f.title}" → ${patch.status}`);
    if (patch.severity && patch.severity !== f.severity) addEvent(f.caseId, 'finding', `"${f.title}" severity → ${patch.severity}`);
    Object.assign(f, patch);
    f.updatedAt = now();
    const c = db.get().cases.find((x) => x.id === f.caseId); if (c) touch(c);
    db.save();
    return f;
  },

  removeFinding(id: string): void {
    const d = db.get();
    d.findings = d.findings.filter((f) => f.id !== id);
    db.save();
  },

  addComment(caseId: string, input: { text: string; findingId?: string }): Comment {
    const c: Comment = { id: randomUUID(), caseId, findingId: input.findingId, text: input.text, createdAt: now() };
    db.get().comments.push(c);
    db.save();
    return c;
  },

  addEvidence(caseId: string, input: { kind: EvidenceKind; title: string; contentText?: string; source?: string; findingId?: string }): Evidence {
    const e: Evidence = { id: randomUUID(), caseId, findingId: input.findingId, kind: input.kind, title: input.title, contentText: input.contentText, source: input.source, createdAt: now() };
    db.get().evidence.unshift(e);
    addEvent(caseId, 'evidence', `Evidence pinned: ${input.title}`);
    db.save();
    return e;
  },

  addScreenshot(caseId: string, input: { title: string; dataUrl: string; findingId?: string }): Evidence {
    const m = /^data:(image\/\w+);base64,(.+)$/s.exec(input.dataUrl);
    if (!m) throw new Error('invalid image data URL');
    const buf = Buffer.from(m[2], 'base64');
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const ext = m[1].split('/')[1];
    const path = join(db.evidenceDir(), `${sha256}.${ext}`);
    if (!existsSync(path)) writeFileSync(path, buf);
    const e: Evidence = { id: randomUUID(), caseId, findingId: input.findingId, kind: 'screenshot', title: input.title, mime: m[1], sha256, createdAt: now() };
    db.get().evidence.unshift(e);
    addEvent(caseId, 'evidence', `Screenshot pinned: ${input.title}`);
    db.save();
    return e;
  },

  evidenceDataUrl(id: string): string {
    const e = db.get().evidence.find((x) => x.id === id);
    if (!e || !e.sha256 || !e.mime) throw new Error('no image evidence');
    const path = join(db.evidenceDir(), `${e.sha256}.${e.mime.split('/')[1]}`);
    return `data:${e.mime};base64,${readFileSync(path).toString('base64')}`;
  },

  deleteBlob(e: Evidence): void {
    if (e.sha256 && e.mime) {
      try { unlinkSync(join(db.evidenceDir(), `${e.sha256}.${e.mime.split('/')[1]}`)); } catch { /* gone */ }
    }
  },

  removeEvidence(id: string): void {
    const d = db.get();
    const e = d.evidence.find((x) => x.id === id);
    if (e) this.deleteBlob(e);
    d.evidence = d.evidence.filter((x) => x.id !== id);
    db.save();
  },

  report(id: string, format: 'html' | 'json'): string {
    const detail = this.get(id);
    if (format === 'json') {
      const evidence = detail.evidence.map((e) => (e.kind === 'screenshot' ? { ...e, dataUrl: this.evidenceDataUrl(e.id) } : e));
      return JSON.stringify({ ...detail, evidence, generatedAt: now() }, null, 2);
    }
    return buildHtmlReport(detail, (e) => this.evidenceDataUrl(e.id));
  },
};

function esc(s: string | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function buildHtmlReport(d: CaseDetail, dataUrl: (e: Evidence) => string): string {
  const dt = (t: number) => new Date(t).toLocaleString();
  const sevColor: Record<Severity, string> = { critical: '#ff4757', high: '#f5a524', medium: '#56a8ff', low: '#8b94a7', info: '#5c6577' };
  const badge = (s: Severity) => `<span style="color:${sevColor[s]};border:1px solid ${sevColor[s]};border-radius:20px;padding:1px 8px;font-size:11px">${s}</span>`;
  const rollupLine = SEVERITIES.filter((s) => d.rollup.counts[s]).map((s) => `${badge(s)} ${d.rollup.counts[s]}`).join(' &nbsp; ') || '<span style="color:#8b94a7">no findings</span>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.case.title)} — KubeNinja case report</title>
<style>
body{margin:0;background:#0a0c11;color:#e6e9ef;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.55}
.wrap{max-width:900px;margin:0 auto;padding:40px 28px}
h1{font-size:26px;margin:0 0 4px} h2{font-size:16px;margin:34px 0 12px;color:#2dd4a7;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px}
.muted{color:#8b94a7} .mono{font-family:ui-monospace,Consolas,monospace}
table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
th{color:#5c6577;text-transform:uppercase;font-size:10.5px;letter-spacing:.06em}
.card{background:#12151d;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px;margin-bottom:12px}
img{max-width:100%;border:1px solid rgba(255,255,255,.12);border-radius:8px;margin-top:8px}
pre{background:#0b0e14;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;overflow:auto;font-size:12px;white-space:pre-wrap}
.tl{border-left:2px solid rgba(255,255,255,.1);padding-left:14px;margin-left:4px}
.tl .it{position:relative;padding:5px 0}
.tl .it::before{content:'';position:absolute;left:-19px;top:11px;width:7px;height:7px;border-radius:50%;background:#2dd4a7}
</style></head><body><div class="wrap">
<div class="muted mono" style="font-size:11px">KubeNinja · investigation report · generated ${dt(now())}</div>
<h1>${esc(d.case.title)}</h1>
<div class="muted">${d.case.cluster ? `Cluster <b class="mono">${esc(d.case.cluster)}</b> · ` : ''}Status <b>${d.case.status}</b> · Opened ${dt(d.case.createdAt)}</div>
${d.case.description ? `<p>${esc(d.case.description)}</p>` : ''}
<div style="margin-top:10px">${rollupLine}</div>

<h2>Findings (${d.findings.length})</h2>
${d.findings.length ? `<table><thead><tr><th>Severity</th><th>Title</th><th>Status</th><th>Resource</th></tr></thead><tbody>
${d.findings.map((f) => `<tr><td>${badge(f.severity)}</td><td>${esc(f.title)}${f.detail ? `<div class="muted" style="margin-top:3px">${esc(f.detail)}</div>` : ''}</td><td>${f.status}</td><td class="mono">${esc(f.resource)}</td></tr>`).join('')}
</tbody></table>` : '<div class="muted">No findings recorded.</div>'}

<h2>Evidence (${d.evidence.length})</h2>
${d.evidence.length ? d.evidence.map((e) => `<div class="card"><b>${esc(e.title)}</b> <span class="muted">· ${e.kind}${e.source ? ` · ${esc(e.source)}` : ''}</span>
${e.kind === 'screenshot' ? `<div><img src="${dataUrl(e)}" alt="${esc(e.title)}"></div>` : `<pre>${esc(e.contentText)}</pre>`}</div>`).join('') : '<div class="muted">No evidence pinned.</div>'}

<h2>Timeline (${d.timeline.length})</h2>
<div class="tl">${d.timeline.map((t) => `<div class="it"><span class="muted mono" style="font-size:11px">${dt(t.ts)}</span> · ${esc(t.text)}</div>`).join('') || '<div class="muted">No events.</div>'}</div>
</div></body></html>`;
}
