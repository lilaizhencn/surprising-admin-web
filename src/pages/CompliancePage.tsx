import { safeInteger } from "../lib/integers";
import { useState, useRef, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { decideMfaRecovery, complianceUsers, complianceRiskTags, complianceAmlCases, complianceMfaRecoveryRequests, complianceUser, updateKyc, createRiskTag, resolveRiskTag, createAmlCase, updateAmlCaseStatus, complianceKycDocument } from "../api/admin";
import { Search, Eye, Download } from "lucide-react";
import { compactNumber } from "../config";
import { optionalPositiveInt64 } from "../lib/integers";
import { cursorInfo, Page, TextFilter, SortSelect, Metric, Panel, DataTable, TwoColumn, CursorPager, KeyValue, Empty, StatusBadge } from "../components/AdminUi";
import { errorMessage, fieldText, objectValue, records } from "../lib/adminData";
import { enumOrDefault, jsonObject, textOrNull } from "../lib/formValues";
import { UPDATED_AT_SORTS } from "../lib/queryOptions";

const KYC_LEVELS = ["NONE", "BASIC", "ADVANCED", "INSTITUTIONAL"];

const KYC_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"];

const RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const RISK_TAG_STATUSES = ["ACTIVE", "RESOLVED"];

const AML_STATUSES = ["OPEN", "REVIEWING", "ESCALATED", "RESTRICTED", "CLEARED", "CLOSED"];

export default function CompliancePage() {
  const [filters, setFilters] = useState({ userId: "", kycStatus: "", tagCode: "", limit: "100", cursor: "", sort: "updatedAt.desc" });
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [users, setUsers] = useState<UnknownRecord[]>([]);
  const [riskTagFilters, setRiskTagFilters] = useState({ userId: "", status: "ACTIVE", limit: "100", cursor: "", sort: "createdAt.desc" });
  const [riskTagPageInfo, setRiskTagPageInfo] = useState(cursorInfo());
  const [globalRiskTags, setGlobalRiskTags] = useState<UnknownRecord[]>([]);
  const [amlCaseFilters, setAmlCaseFilters] = useState({ userId: "", status: "", limit: "100", cursor: "", sort: "updatedAt.desc" });
  const [amlCasePageInfo, setAmlCasePageInfo] = useState(cursorInfo());
  const [globalAmlCases, setGlobalAmlCases] = useState<UnknownRecord[]>([]);
  const [mfaRecoveryRequests, setMfaRecoveryRequests] = useState<UnknownRecord[]>([]);
  const [detail, setDetail] = useState<UnknownRecord | null>(null);
  const [kycForm, setKycForm] = useState(kycFormTemplate());
  const [riskTagForm, setRiskTagForm] = useState(riskTagFormTemplate());
  const [amlCaseForm, setAmlCaseForm] = useState(amlCaseFormTemplate());
  const [amlStatusForm, setAmlStatusForm] = useState(amlStatusFormTemplate());
  const [kycJson, setKycJson] = useState(() => JSON.stringify(kycPayload(kycFormTemplate()), null, 2));
  const [tagJson, setTagJson] = useState(() => JSON.stringify(riskTagPayload(riskTagFormTemplate()), null, 2));
  const [amlJson, setAmlJson] = useState(() => JSON.stringify(amlCasePayload(amlCaseFormTemplate()), null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kycPreview, setKycPreview] = useState<{ url: string; contentType: string; filename: string } | null>(null);
  const kycPreviewCloseRef = useRef<HTMLButtonElement>(null);
  const kycPreviewRef = useRef<HTMLDivElement>(null);
  const kycRequestVersionRef = useRef(0);

  useEffect(() => () => {
    if (kycPreview) URL.revokeObjectURL(kycPreview.url);
  }, [kycPreview]);

  async function reviewMfaRecovery(row: UnknownRecord, approved: boolean) {
    const reason = window.prompt(approved ? "确认身份资料匹配说明" : "拒绝原因");
    if (reason === null) return;
    setLoading(true);
    setError("");
    try {
      await decideMfaRecovery(String(row.requestId), approved, reason.trim());
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!kycPreview) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    kycPreviewCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setKycPreview(null);
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(kycPreviewRef.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])") ?? [])
          .filter((element) => !element.hasAttribute("disabled"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [kycPreview]);

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateRiskTagFilters(patch: Partial<typeof riskTagFilters>) {
    setRiskTagFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateAmlCaseFilters(patch: Partial<typeof amlCaseFilters>) {
    setAmlCaseFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateKycForm(patch: Partial<ReturnType<typeof kycFormTemplate>>) {
    const next = { ...kycForm, ...patch };
    setKycForm(next);
    setKycJson(JSON.stringify(kycPayload(next), null, 2));
  }

  function updateRiskTagForm(patch: Partial<ReturnType<typeof riskTagFormTemplate>>) {
    const next = { ...riskTagForm, ...patch };
    setRiskTagForm(next);
    setTagJson(JSON.stringify(riskTagPayload(next), null, 2));
  }

  function updateAmlCaseForm(patch: Partial<ReturnType<typeof amlCaseFormTemplate>>) {
    const next = { ...amlCaseForm, ...patch };
    setAmlCaseForm(next);
    setAmlJson(JSON.stringify(next, null, 2));
  }

  function fillAmlStatus(row: UnknownRecord) {
    setAmlStatusForm({
      caseId: fieldText(row.caseId),
      status: enumOrDefault(row.status, AML_STATUSES, "REVIEWING"),
      riskScore: fieldText(row.riskScore)
    });
  }

  async function load(
    nextCursor = filters.cursor,
    nextRiskTagCursor = riskTagFilters.cursor,
    nextAmlCaseCursor = amlCaseFilters.cursor
  ) {
    setLoading(true);
    setError("");
    try {
      const [response, riskTagResponse, amlCaseResponse, recoveryResponse] = await Promise.all([
        complianceUsers({
          userId: filters.userId,
          kycStatus: filters.kycStatus,
          tagCode: filters.tagCode,
          limit: Number(filters.limit) || 100,
          cursor: nextCursor,
          sort: filters.sort
        }),
        complianceRiskTags({
          userId: riskTagFilters.userId,
          status: riskTagFilters.status,
          limit: Number(riskTagFilters.limit) || 100,
          cursor: nextRiskTagCursor,
          sort: riskTagFilters.sort
        }),
        complianceAmlCases({
          userId: amlCaseFilters.userId,
          status: amlCaseFilters.status,
          limit: Number(amlCaseFilters.limit) || 100,
          cursor: nextAmlCaseCursor,
          sort: amlCaseFilters.sort
        }),
        complianceMfaRecoveryRequests()
      ]);
      setUsers(response.users);
      setPageInfo(cursorInfo(response));
      setGlobalRiskTags(riskTagResponse.tags);
      setRiskTagPageInfo(cursorInfo(riskTagResponse));
      setGlobalAmlCases(amlCaseResponse.cases);
      setAmlCasePageInfo(cursorInfo(amlCaseResponse));
      setMfaRecoveryRequests(recoveryResponse);
      setFilters((current) => ({ ...current, cursor: nextCursor || "" }));
      setRiskTagFilters((current) => ({ ...current, cursor: nextRiskTagCursor || "" }));
      setAmlCaseFilters((current) => ({ ...current, cursor: nextAmlCaseCursor || "" }));
      if (detail?.user && "userId" in (detail.user as UnknownRecord)) {
        await loadDetail(String((detail.user as UnknownRecord).userId));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(userId: number | string) {
    const requestVersion = kycRequestVersionRef.current + 1;
    kycRequestVersionRef.current = requestVersion;
    setKycPreview(null);
    setLoading(true);
    setError("");
    try {
      const response = await complianceUser(userId);
      if (kycRequestVersionRef.current !== requestVersion) return;
      setDetail(response);
      const nextKycForm = kycFormFromRecord(objectValue(response.kyc) || { kycLevel: "BASIC", status: "PENDING" });
      setKycForm(nextKycForm);
      setKycJson(JSON.stringify(kycPayload(nextKycForm), null, 2));
    } catch (err) {
      if (kycRequestVersionRef.current === requestVersion) {
        setError(errorMessage(err));
      }
    } finally {
      if (kycRequestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }

  async function saveKyc() {
    const userId = detailUserId(detail);
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      await updateKyc(userId, jsonObject(kycJson));
      await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addRiskTag() {
    const userId = detailUserId(detail);
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      await createRiskTag(userId, jsonObject(tagJson));
      await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function closeRiskTag(tagId: unknown) {
    const userId = detailUserId(detail);
    if (!tagId) return;
    setLoading(true);
    setError("");
    try {
      await resolveRiskTag(String(tagId));
      if (userId) await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addAmlCase() {
    const userId = detailUserId(detail);
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const draft = jsonObject(amlJson);
      const form = { ...amlCaseFormTemplate(), ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, fieldText(value)])) };
      await createAmlCase(userId, amlCasePayload(form));
      await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitAmlStatus(caseId: unknown = amlStatusForm.caseId) {
    const userId = detailUserId(detail);
    if (!caseId) return;
    setLoading(true);
    setError("");
    try {
      await updateAmlCaseStatus(String(caseId), {
        status: amlStatusForm.status,
        riskScore: amlStatusForm.riskScore.trim() ? safeInteger(amlStatusForm.riskScore, "风险分") : undefined
      });
      if (userId) await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function openKycDocument(documentRecord: UnknownRecord) {
    const userId = detailUserId(detail);
    const normalizedDocumentId = fieldText(documentRecord.documentId);
    if (!userId || !normalizedDocumentId) return;
    const requestVersion = kycRequestVersionRef.current + 1;
    kycRequestVersionRef.current = requestVersion;
    setLoading(true);
    setError("");
    try {
      const blob = await complianceKycDocument(userId, normalizedDocumentId);
      const url = URL.createObjectURL(blob);
      if (kycRequestVersionRef.current !== requestVersion) {
        URL.revokeObjectURL(url);
        return;
      }
      const contentType = (blob.type || fieldText(documentRecord.contentType))
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      setKycPreview({
        url,
        contentType,
        filename: fieldText(documentRecord.originalFilename) || "KYC 原件"
      });
    } catch (err) {
      if (kycRequestVersionRef.current === requestVersion) {
        setError(errorMessage(err));
      }
    } finally {
      if (kycRequestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }

  function downloadKycPreview() {
    if (!kycPreview) return;
    const link = document.createElement("a");
    link.href = kycPreview.url;
    link.download = kycPreview.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  useEffect(() => { void load(); }, []);

  const riskTags = records(detail?.riskTags as UnknownRecord[] | undefined);
  const amlCases = records(detail?.amlCases as UnknownRecord[] | undefined);
  const kycDocuments = records(detail?.kycDocuments as UnknownRecord[] | undefined);

  return (
    <Page title="合规风控" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <label>KYC 状态<select value={filters.kycStatus} onChange={(event) => updateFilters({ kycStatus: event.target.value })}>
          <option value="">全部</option>
          {KYC_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <TextFilter label="风险标签" value={filters.tagCode} onChange={(value) => updateFilters({ tagCode: value.toUpperCase() })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect value={filters.sort} options={UPDATED_AT_SORTS} onChange={(value) => updateFilters({ sort: value })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <div className="metrics">
        <Metric label="用户数" value={users.length} tone="ok" />
        <Metric label="已认证" value={users.filter((item) => item.kycStatus === "VERIFIED").length} tone="ok" />
        <Metric label="待审核" value={users.filter((item) => item.kycStatus === "PENDING").length} tone="warn" />
        <Metric label="风险标签" value={users.reduce((sum, item) => sum + Number(item.activeRiskTags ?? 0), 0)} tone="warn" />
        <Metric label="AML Case" value={users.reduce((sum, item) => sum + Number(item.openAmlCases ?? 0), 0)} tone="danger" />
        <Metric label="当前用户" value={detailUserId(detail) || "-"} tone="muted" />
      </div>
      <Panel title="谷歌验证器丢失申诉">
        <p className="muted">先打开用户详情检查已通过的 KYC 资料和原始材料，再决定是否解除旧验证器。批准后旧密钥立即失效，提现冻结 24 小时。</p>
        <DataTable
          rows={mfaRecoveryRequests}
          columns={["requestId", "userId", "status", "reason", "submittedAt"]}
          actions={(row) => (
            <div className="row-actions">
              <button onClick={() => void loadDetail(String(row.userId ?? ""))}>查看 KYC</button>
              <button className="primary" onClick={() => void reviewMfaRecovery(row, true)}>核验通过并解除</button>
              <button onClick={() => void reviewMfaRecovery(row, false)}>拒绝</button>
            </div>
          )}
        />
      </Panel>
      <TwoColumn>
        <Panel title="合规用户">
          <div className="stack">
            <DataTable
              rows={users}
              columns={["userId", "username", "userStatus", "kycLevel", "kycStatus", "country", "activeRiskTags", "openAmlCases", "updatedAt"]}
              onRowClick={(row) => void loadDetail(String(row.userId ?? ""))}
              mobileAction={{
                label: "打开详情",
                onClick: (row) => void loadDetail(String(row.userId ?? ""))
              }}
            />
            <CursorPager
              page={pageInfo}
              cursor={filters.cursor}
              onNext={() => void load(pageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
        <Panel title="用户合规详情">
          {detail ? (
            <div className="stack">
              <KeyValue data={(detail.user as UnknownRecord) ?? {}} />
              <KeyValue data={(detail.kyc as UnknownRecord) ?? { status: "UNVERIFIED" }} />
            </div>
          ) : <Empty text="选择用户" />}
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="风险标签审计">
          <div className="stack">
            <div className="filters compact">
              <TextFilter label="User ID" value={riskTagFilters.userId} onChange={(value) => updateRiskTagFilters({ userId: value })} />
              <label>状态
                <select value={riskTagFilters.status} onChange={(event) => updateRiskTagFilters({ status: event.target.value })}>
	                  <option value="">全部</option>
	                  {RISK_TAG_STATUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <TextFilter label="Limit" value={riskTagFilters.limit} onChange={(value) => updateRiskTagFilters({ limit: value })} />
              <SortSelect value={riskTagFilters.sort} options={COMPLIANCE_RISK_TAG_SORTS} onChange={(value) => updateRiskTagFilters({ sort: value })} />
              <button onClick={() => void load(filters.cursor, "", amlCaseFilters.cursor)}><Search size={16} />查询标签</button>
            </div>
            <CursorPager
              page={riskTagPageInfo}
              cursor={riskTagFilters.cursor}
              onNext={() => void load(filters.cursor, riskTagPageInfo.nextCursor || "", amlCaseFilters.cursor)}
              onReset={() => void load(filters.cursor, "", amlCaseFilters.cursor)}
            />
            <DataTable
              rows={globalRiskTags}
              columns={["tagId", "userId", "tagCode", "severity", "status", "source", "createdByUserId", "resolvedByUserId", "createdAt", "updatedAt"]}
              maxColumns={10}
              actions={(row) => row.status === "ACTIVE" ? <button onClick={() => void closeRiskTag(row.tagId)}>解除</button> : <StatusBadge value="RESOLVED" />}
            />
          </div>
        </Panel>
        <Panel title="AML Case 审计">
          <div className="stack">
            <div className="filters compact">
              <TextFilter label="User ID" value={amlCaseFilters.userId} onChange={(value) => updateAmlCaseFilters({ userId: value })} />
              <label>状态
                <select value={amlCaseFilters.status} onChange={(event) => updateAmlCaseFilters({ status: event.target.value })}>
	                  <option value="">全部</option>
	                  {AML_STATUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <TextFilter label="Limit" value={amlCaseFilters.limit} onChange={(value) => updateAmlCaseFilters({ limit: value })} />
              <SortSelect value={amlCaseFilters.sort} options={COMPLIANCE_AML_CASE_SORTS} onChange={(value) => updateAmlCaseFilters({ sort: value })} />
              <button onClick={() => void load(filters.cursor, riskTagFilters.cursor, "")}><Search size={16} />查询 Case</button>
            </div>
            <CursorPager
              page={amlCasePageInfo}
              cursor={amlCaseFilters.cursor}
              onNext={() => void load(filters.cursor, riskTagFilters.cursor, amlCasePageInfo.nextCursor || "")}
              onReset={() => void load(filters.cursor, riskTagFilters.cursor, "")}
            />
            <DataTable
	              rows={globalAmlCases}
	              columns={["caseId", "userId", "status", "riskScore", "source", "assignedAdminUserId", "createdByUserId", "reviewedByUserId", "createdAt", "updatedAt"]}
	              maxColumns={10}
	              actions={(row) => <button onClick={() => fillAmlStatus(row)}>填充状态</button>}
	            />
          </div>
        </Panel>
      </TwoColumn>
      {detail && (
        <>
          <TwoColumn>
            <Panel title="KYC 审核">
              <div className="stack">
                <div className="form-grid">
                  <label>KYC Level<select value={kycForm.kycLevel} onChange={(event) => updateKycForm({ kycLevel: event.target.value })}>{KYC_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>状态<select value={kycForm.status} onChange={(event) => updateKycForm({ status: event.target.value })}>{KYC_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="国家/地区" value={kycForm.country} onChange={(value) => updateKycForm({ country: value.toUpperCase() })} />
                  <TextFilter label="证件类型" value={kycForm.documentType} onChange={(value) => updateKycForm({ documentType: value.toUpperCase() })} />
                  <TextFilter label="Provider" value={kycForm.provider} onChange={(value) => updateKycForm({ provider: value })} />
                  <TextFilter label="Provider Ref" value={kycForm.providerReference} onChange={(value) => updateKycForm({ providerReference: value })} />
                  <TextFilter label="过期时间 ISO" value={kycForm.expiresAt} onChange={(value) => updateKycForm({ expiresAt: value })} />
                </div>
                <label>拒绝原因<textarea className="json-editor small text-editor" value={kycForm.rejectionReason} onChange={(event) => updateKycForm({ rejectionReason: event.target.value })} /></label>
                <details className="raw-toggle">
                  <summary>高级 JSON 请求体</summary>
                  <textarea className="json-editor small" value={kycJson} onChange={(event) => setKycJson(event.target.value)} />
                </details>
                <button className="primary" onClick={() => void saveKyc()}>保存 KYC</button>
              </div>
            </Panel>
            <Panel title="新增风险标签">
              <div className="stack">
                <div className="form-grid">
                  <TextFilter label="Tag Code" value={riskTagForm.tagCode} onChange={(value) => updateRiskTagForm({ tagCode: value.toUpperCase() })} />
                  <label>严重度<select value={riskTagForm.severity} onChange={(event) => updateRiskTagForm({ severity: event.target.value })}>{RISK_SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="来源" value={riskTagForm.source} onChange={(value) => updateRiskTagForm({ source: value.toUpperCase() })} />
                </div>
                <label>原因<textarea className="json-editor small text-editor" value={riskTagForm.reason} onChange={(event) => updateRiskTagForm({ reason: event.target.value })} /></label>
                <details className="raw-toggle">
                  <summary>高级 JSON 请求体</summary>
                  <textarea className="json-editor small" value={tagJson} onChange={(event) => setTagJson(event.target.value)} />
                </details>
                <button className="primary" onClick={() => void addRiskTag()}>新增标签</button>
              </div>
            </Panel>
            <Panel title={`材料证据 (${kycDocuments.length})`}>
              {kycDocuments.length === 0 ? <Empty text="当前用户尚未上传材料" /> : (
                <div className="stack kyc-document-list">
                  {kycDocuments.map((document) => (
                    <div className="kyc-document-item" key={fieldText(document.documentId)}>
                      <div className="kyc-document-meta">
                        <strong>{fieldText(document.originalFilename) || "未命名材料"}</strong>
                        <span>{fieldText(document.documentType)} · {fieldText(document.contentType)} · {compactNumber(document.fileSize)} bytes</span>
                        <span>状态：{fieldText(document.status)} · SHA-256：{fieldText(document.sha256).slice(0, 16)}…</span>
                      </div>
                      <button disabled={loading} onClick={() => void openKycDocument(document)}><Eye size={15} />查看原件</button>
                    </div>
                  ))}
                </div>
              )}
              {kycPreview && (
                <div ref={kycPreviewRef} className="kyc-document-preview" role="dialog" aria-label={`原件预览：${kycPreview.filename}`}>
                  <div className="kyc-document-preview-heading">
                    <div>
                      <strong>{kycPreview.filename}</strong>
                      <span>原件已加载 · {kycPreview.contentType}</span>
                    </div>
                    <div className="button-row">
                      <button onClick={downloadKycPreview}><Download size={15} />下载原件</button>
                      <button ref={kycPreviewCloseRef} onClick={() => setKycPreview(null)}>关闭预览</button>
                    </div>
                  </div>
                  {kycPreview.contentType.startsWith("application/pdf") ? (
                    <iframe tabIndex={-1} title={`KYC 原件：${kycPreview.filename}`} src={kycPreview.url} />
                  ) : (
                    <img src={kycPreview.url} alt={`KYC 原件：${kycPreview.filename}`} />
                  )}
                </div>
              )}
            </Panel>
          </TwoColumn>
          <Panel title="风险标签">
            <DataTable
              rows={riskTags}
              columns={["tagId", "userId", "tagCode", "severity", "status", "source", "reason", "createdAt", "resolvedAt"]}
              actions={(row) => row.status === "ACTIVE" ? <button onClick={() => void closeRiskTag(row.tagId)}>解除</button> : <StatusBadge value="RESOLVED" />}
            />
          </Panel>
          <TwoColumn>
            <Panel title="新增 AML Case">
              <div className="stack">
                <div className="form-grid">
                  <label>状态<select value={amlCaseForm.status} onChange={(event) => updateAmlCaseForm({ status: event.target.value })}>{AML_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="风险分" value={amlCaseForm.riskScore} onChange={(value) => updateAmlCaseForm({ riskScore: value })} />
                  <TextFilter label="来源" value={amlCaseForm.source} onChange={(value) => updateAmlCaseForm({ source: value.toUpperCase() })} />
                  <TextFilter label="指派管理员 ID" value={amlCaseForm.assignedAdminUserId} onChange={(value) => updateAmlCaseForm({ assignedAdminUserId: value })} />
                </div>
                <label>摘要<textarea className="json-editor small text-editor" value={amlCaseForm.summary} onChange={(event) => updateAmlCaseForm({ summary: event.target.value })} /></label>
                <details className="raw-toggle">
                  <summary>高级 JSON 请求体</summary>
                  <textarea className="json-editor small" value={amlJson} onChange={(event) => setAmlJson(event.target.value)} />
                </details>
                <button className="primary" onClick={() => void addAmlCase()}>新增 Case</button>
              </div>
            </Panel>
            <Panel title="更新 AML Case 状态">
              <div className="stack">
                <div className="form-grid">
                  <TextFilter label="Case ID" value={amlStatusForm.caseId} onChange={(value) => setAmlStatusForm((current) => ({ ...current, caseId: value }))} />
                  <label>状态<select value={amlStatusForm.status} onChange={(event) => setAmlStatusForm((current) => ({ ...current, status: event.target.value }))}>{AML_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="风险分" value={amlStatusForm.riskScore} onChange={(value) => setAmlStatusForm((current) => ({ ...current, riskScore: value }))} />
                </div>
                <button className="primary" onClick={() => void submitAmlStatus()}>提交状态更新</button>
              </div>
            </Panel>
          </TwoColumn>
          <Panel title="AML Case">
              <DataTable
                rows={amlCases}
                columns={["caseId", "userId", "status", "riskScore", "source", "summary", "assignedAdminUserId", "updatedAt"]}
                actions={(row) => <button onClick={() => fillAmlStatus(row)}>填充状态</button>}
              />
          </Panel>
        </>
      )}
    </Page>
  );
}

function kycFormTemplate() {
  return {
    kycLevel: "BASIC",
    status: "PENDING",
    country: "",
    documentType: "",
    provider: "manual",
    providerReference: "",
    rejectionReason: "",
    expiresAt: ""
  };
}

function riskTagFormTemplate() {
  return {
    tagCode: "HIGH_RISK",
    severity: "HIGH",
    source: "MANUAL",
    reason: ""
  };
}

function amlCaseFormTemplate() {
  return {
    status: "OPEN",
    riskScore: "50",
    source: "MANUAL",
    summary: "",
    assignedAdminUserId: ""
  };
}

function amlStatusFormTemplate() {
  return {
    caseId: "",
    status: "REVIEWING",
    riskScore: ""
  };
}

function kycFormFromRecord(row: UnknownRecord) {
  return {
    kycLevel: enumOrDefault(row.kycLevel, KYC_LEVELS, "BASIC"),
    status: enumOrDefault(row.status, KYC_STATUSES, "PENDING"),
    country: fieldText(row.country),
    documentType: fieldText(row.documentType),
    provider: fieldText(row.provider) || "manual",
    providerReference: fieldText(row.providerReference),
    rejectionReason: fieldText(row.rejectionReason),
    expiresAt: fieldText(row.expiresAt)
  };
}

function kycPayload(form: ReturnType<typeof kycFormTemplate>): UnknownRecord {
  return {
    kycLevel: form.kycLevel,
    status: form.status,
    country: textOrNull(form.country.toUpperCase()),
    documentType: textOrNull(form.documentType.toUpperCase()),
    provider: textOrNull(form.provider),
    providerReference: textOrNull(form.providerReference),
    rejectionReason: textOrNull(form.rejectionReason),
    expiresAt: textOrNull(form.expiresAt)
  };
}

function riskTagPayload(form: ReturnType<typeof riskTagFormTemplate>): UnknownRecord {
  return {
    tagCode: form.tagCode.trim().toUpperCase(),
    severity: form.severity,
    source: textOrNull(form.source.toUpperCase()),
    reason: form.reason.trim()
  };
}

function amlCasePayload(form: ReturnType<typeof amlCaseFormTemplate>): UnknownRecord {
  return {
    status: form.status,
    riskScore: safeInteger(form.riskScore, "风险分"),
    source: textOrNull(form.source.toUpperCase()),
    summary: form.summary.trim(),
    assignedAdminUserId: optionalPositiveInt64(form.assignedAdminUserId, "指派管理员 ID")
  };
}

const COMPLIANCE_RISK_TAG_SORTS = ["createdAt.desc", "createdAt.asc", "updatedAt.desc", "updatedAt.asc"];

const COMPLIANCE_AML_CASE_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];

function detailUserId(detail: UnknownRecord | null): string {
  const user = objectValue(detail?.user);
  const userId = user.userId;
  return userId === undefined || userId === null || userId === "" ? "" : String(userId);
}
