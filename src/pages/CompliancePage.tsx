import { positiveInt64, safeInteger } from "../lib/integers";
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

import { KYC_LEVELS, KYC_STATUSES, complianceDetail, complianceRows, validateKycReview } from "../lib/compliance";

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
  const [selectedUserId, setSelectedUserId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState("");
  const [usersReady, setUsersReady] = useState(false);
  const [readErrors, setReadErrors] = useState({ users: "", tags: "", cases: "", recovery: "" });
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const writeBusy = useRef(false);
  const mounted = useRef(true);
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
  const kycPreviewRef = useRef<HTMLDialogElement>(null);
  const kycRequestVersionRef = useRef(0);
  const detailFocus = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!detail) return;
    detailFocus.current?.focus({ preventScroll: true });
    if (window.innerWidth < 760) detailFocus.current?.scrollIntoView({ block: "start" });
  }, [detail]);

  useEffect(() => () => {
    if (kycPreview) URL.revokeObjectURL(kycPreview.url);
  }, [kycPreview]);

  async function reviewMfaRecovery(row: UnknownRecord, approved: boolean) {
    if (writeBusy.current || row.status !== "PENDING") return;
    const userId = positiveInt64(row.userId, "申诉用户 ID");
    const requestId = positiveInt64(row.requestId, "申诉 ID");
    const reason = window.prompt(`用户 ${userId} · 申诉 ${requestId}\n${approved ? "确认身份资料匹配说明" : "拒绝原因"}（8–500 字）`);
    if (reason === null) return;
    if (reason.trim().length < 8 || reason.trim().length > 500) { setError("请填写 8–500 字审核说明。"); return; }
    await runWrite(
      `${approved ? "核验通过并解除旧验证器" : "拒绝验证器申诉"}\n用户：${userId}\n申诉：${requestId}\n说明：${reason.trim()}${approved ? "\n批准后旧密钥立即失效，提现冻结 24 小时。" : ""}`,
      () => decideMfaRecovery(requestId, approved, reason.trim()),
    );
  }

  useEffect(() => {
    if (!kycPreview) return;
    const dialog = kycPreviewRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    kycPreviewCloseRef.current?.focus();
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [kycPreview]);

  function updateFilters(patch: Partial<typeof filters>) {
    detailRequest.current?.abort(); previewRequest.current?.abort();
    setSelectedUserId(""); setDetail(null); setDetailError(""); setDetailLoading(false); setKycPreview(null); setPreviewLoading(false);
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
    listRequest.current?.abort();
    const abort = new AbortController();
    listRequest.current = abort;
    setLoading(true);
    setError(""); setNotice("");
    setReadErrors({ users: "", tags: "", cases: "", recovery: "" });
    setUsersReady(false);
    setUsers([]); setGlobalRiskTags([]); setGlobalAmlCases([]); setMfaRecoveryRequests([]);
    const responses = await Promise.allSettled([
      complianceUsers({ ...filters, limit: Number(filters.limit) || 100, cursor: nextCursor }, abort.signal),
      complianceRiskTags({ ...riskTagFilters, limit: Number(riskTagFilters.limit) || 100, cursor: nextRiskTagCursor }, abort.signal),
      complianceAmlCases({ ...amlCaseFilters, limit: Number(amlCaseFilters.limit) || 100, cursor: nextAmlCaseCursor }, abort.signal),
      complianceMfaRecoveryRequests(abort.signal)
    ]);
    if (abort.signal.aborted) return;
    const errors = { users: "", tags: "", cases: "", recovery: "" };
    const keys = ["users", "tags", "cases", "recovery"] as const;
    responses.forEach((result, index) => {
      const key = keys[index];
      try {
        if (result.status === "rejected") throw result.reason;
        const response = result.value;
        if (key === "recovery") setMfaRecoveryRequests(complianceRows(response));
        else {
          const page = objectValue(response);
          const rows = complianceRows(page[key]);
          if (key === "users") { setUsers(rows); setPageInfo(cursorInfo(page)); setUsersReady(true); setFilters(current => ({ ...current, cursor: nextCursor || "" })); }
          if (key === "tags") { setGlobalRiskTags(rows); setRiskTagPageInfo(cursorInfo(page)); setRiskTagFilters(current => ({ ...current, cursor: nextRiskTagCursor || "" })); }
          if (key === "cases") { setGlobalAmlCases(rows); setAmlCasePageInfo(cursorInfo(page)); setAmlCaseFilters(current => ({ ...current, cursor: nextAmlCaseCursor || "" })); }
        }
      } catch (reason) { errors[key] = errorMessage(reason); }
    });
    setReadErrors(errors);
    setLoading(false);
  }

  async function loadDetail(value: number | string, afterWrite = false) {
    if (writeBusy.current && !afterWrite) return;
    let userId: string;
    try { userId = positiveInt64(value, "用户 ID"); }
    catch (reason) { setError(errorMessage(reason)); return; }
    detailRequest.current?.abort();
    previewRequest.current?.abort();
    const abort = new AbortController();
    detailRequest.current = abort;
    kycRequestVersionRef.current += 1;
    setKycPreview(null);
    setPreviewLoading(false);
    setSelectedUserId(userId);
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    setError("");
    setNotice("");
    setRiskTagForm(riskTagFormTemplate()); setTagJson(JSON.stringify(riskTagPayload(riskTagFormTemplate()), null, 2));
    setAmlCaseForm(amlCaseFormTemplate()); setAmlJson(JSON.stringify(amlCasePayload(amlCaseFormTemplate()), null, 2));
    setAmlStatusForm(amlStatusFormTemplate());
    try {
      const response = complianceDetail(await complianceUser(userId, abort.signal), userId);
      if (abort.signal.aborted) return;
      setDetail(response);
      const nextKycForm = kycFormFromRecord(objectValue(response.kyc));
      setKycForm(nextKycForm);
      setKycJson(JSON.stringify(kycPayload(nextKycForm), null, 2));
    } catch (reason) {
      if (!abort.signal.aborted) setDetailError(errorMessage(reason));
    } finally {
      if (!abort.signal.aborted) setDetailLoading(false);
    }
  }

  async function runWrite(confirmation: string, operation: () => Promise<unknown>) {
    if (writeBusy.current || !window.confirm(confirmation)) return;
    writeBusy.current = true;
    setWriting(true); setError(""); setNotice("");
    listRequest.current?.abort(); previewRequest.current?.abort();
    setLoading(false);
    setKycPreview(null); setPreviewLoading(false);
    try {
      await operation();
      if (!mounted.current) return;
      // Read again before another decision; never preserve a writable pre-decision snapshot.
      setDetail(null); setKycPreview(null);
      await Promise.all([load(), selectedUserId ? loadDetail(selectedUserId, true) : Promise.resolve()]);
      if (mounted.current) setNotice("操作已提交；请核对刷新后的状态。");
    } catch (reason) {
      if (mounted.current) {
        setError(errorMessage(reason));
        setDetail(null); setKycPreview(null);
        setUsersReady(false);
        setUsers([]); setGlobalRiskTags([]); setGlobalAmlCases([]); setMfaRecoveryRequests([]);
        const unavailable = "操作后记录需要重新查询，请使用页面刷新核对状态。";
        setReadErrors({ users: unavailable, tags: unavailable, cases: unavailable, recovery: unavailable });
        setDetailError("操作结果需要重新核对，请重新加载当前用户后再处理。");
      }
    } finally {
      writeBusy.current = false;
      if (mounted.current) setWriting(false);
    }
  }

  async function saveKyc() {
    const userId = detailUserId(detail);
    if (!userId || detailLoading || writeBusy.current) return;
    try {
      const body = jsonObject(kycJson);
      validateKycReview(body, objectValue(detail?.kyc));
      await runWrite(`保存用户 ${userId} 的 KYC 审核\n级别：${fieldText(body.kycLevel)}\n状态：${fieldText(body.status)}\n拒绝原因：${fieldText(body.rejectionReason) || "—"}\n有效期：${fieldText(body.expiresAt) || "未设置"}\n此次操作影响用户认证状态，并沿用后台审批要求。`, () => updateKyc(userId, body));
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function addRiskTag() {
    const userId = detailUserId(detail);
    if (!userId || writeBusy.current) return;
    try {
      const body = jsonObject(tagJson);
      await runWrite(`为用户 ${userId} 新增风险标签\n标签：${fieldText(body.tagCode)}\n严重度：${fieldText(body.severity)}`, () => createRiskTag(userId, body));
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function closeRiskTag(tagId: unknown) {
    if (!tagId || writeBusy.current) return;
    await runWrite(`解除风险标签 ${fieldText(tagId)}？\n此操作将改变该标签的有效状态。`, () => resolveRiskTag(String(tagId)));
  }
  async function addAmlCase() {
    const userId = detailUserId(detail);
    if (!userId || writeBusy.current) return;
    try {
      const draft = jsonObject(amlJson);
      const form = { ...amlCaseFormTemplate(), ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, fieldText(value)])) };
      const body = amlCasePayload(form);
      await runWrite(`为用户 ${userId} 新增 AML Case\n状态：${fieldText(body.status)}\n风险分：${fieldText(body.riskScore)}`, () => createAmlCase(userId, body));
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function submitAmlStatus(caseId: unknown = amlStatusForm.caseId) {
    if (!caseId || !detail || writeBusy.current) return;
    try {
      const body = { status: amlStatusForm.status, riskScore: amlStatusForm.riskScore.trim() ? safeInteger(amlStatusForm.riskScore, "风险分") : undefined };
      await runWrite(`更新 AML Case ${fieldText(caseId)}\n状态：${body.status}\n风险分：${body.riskScore ?? "保持不变"}`, () => updateAmlCaseStatus(String(caseId), body));
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function openKycDocument(documentRecord: UnknownRecord) {
    const userId = detailUserId(detail);
    const normalizedDocumentId = fieldText(documentRecord.documentId);
    if (!userId || !normalizedDocumentId || writing) return;
    previewRequest.current?.abort();
    const abort = new AbortController();
    previewRequest.current = abort;
    const requestVersion = ++kycRequestVersionRef.current;
    setError("");
    setKycPreview(null);
    setPreviewLoading(true);
    try {
      const blob = await complianceKycDocument(userId, normalizedDocumentId, abort.signal);
      if (abort.signal.aborted || kycRequestVersionRef.current !== requestVersion) return;
      const contentType = blob.type.split(";", 1)[0].trim().toLowerCase();
      if (!["image/png", "image/jpeg", "application/pdf"].includes(contentType)) throw new Error("材料格式不支持安全预览，请重新核对原件。");
      const url = URL.createObjectURL(blob);
      setKycPreview({ url, contentType, filename: fieldText(documentRecord.originalFilename) || "KYC 原件" });
    } catch (reason) { if (!abort.signal.aborted) setError(errorMessage(reason)); }
    finally { if (!abort.signal.aborted) setPreviewLoading(false); }
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

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      listRequest.current?.abort(); detailRequest.current?.abort(); previewRequest.current?.abort();
      kycRequestVersionRef.current += 1;
    };
  }, []);

  const riskTags = records(detail?.riskTags as UnknownRecord[] | undefined);
  const amlCases = records(detail?.amlCases as UnknownRecord[] | undefined);
  const kycDocuments = records(detail?.kycDocuments as UnknownRecord[] | undefined);

  return (
    <Page title="合规风控" description="按用户核对认证、原始材料与风险记录。审核操作保留审批要求和审计信息。" onRefresh={() => { if (!writing) void Promise.all([load(), selectedUserId ? loadDetail(selectedUserId) : Promise.resolve()]); }} loading={loading || writing} error={error}>
      {notice && <div role="status" className="alert">{notice}</div>}
      <fieldset className="compliance-workspace" disabled={writing}>
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
      <p className="compliance-scope-note">下方统计仅覆盖当前页用户，不代表全平台总量。风险标签与 AML Case 可在独立审计列表中继续筛选。</p>
      <div className="metrics">
        <Metric label="用户数" value={usersReady ? users.length : "—"} tone="ok" />
        <Metric label="已认证" value={usersReady ? users.filter((item) => item.kycStatus === "VERIFIED").length : "—"} tone="ok" />
        <Metric label="待审核" value={usersReady ? users.filter((item) => item.kycStatus === "PENDING").length : "—"} tone="warn" />
        <Metric label="风险标签" value={usersReady && users.every(row => Number.isSafeInteger(Number(row.activeRiskTags)) && row.activeRiskTags != null) ? users.reduce((sum, item) => sum + Number(item.activeRiskTags), 0) : "—"} tone="warn" />
        <Metric label="AML Case" value={usersReady && users.every(row => Number.isSafeInteger(Number(row.openAmlCases)) && row.openAmlCases != null) ? users.reduce((sum, item) => sum + Number(item.openAmlCases), 0) : "—"} tone="danger" />
        <Metric label="当前用户" value={selectedUserId || "—"} tone="muted" />
      </div>
      <Panel title="谷歌验证器丢失申诉">
        <p className="muted">先打开用户详情检查已通过的 KYC 资料和原始材料，再决定是否解除旧验证器。批准后旧密钥立即失效，提现冻结 24 小时。</p>
        <DataTable
          rows={mfaRecoveryRequests}
          loading={loading} error={readErrors.recovery} emptyText="当前没有待审核的验证器申诉"
          columns={["requestId", "userId", "status", "reason", "submittedAt"]}
          actions={(row) => (
            <div className="row-actions">
              <button onClick={() => void loadDetail(String(row.userId ?? ""))}>查看 KYC</button>
              <button className="primary" disabled={row.status !== "PENDING" || detailUserId(detail) !== String(row.userId) || objectValue(detail?.kyc).status !== "VERIFIED" || !kycDocuments.length} title="请先打开同一用户已通过的 KYC 资料并核对原件" onClick={() => void reviewMfaRecovery(row, true)}>核验通过并解除</button>
              <button disabled={row.status !== "PENDING"} onClick={() => void reviewMfaRecovery(row, false)}>拒绝</button>
            </div>
          )}
        />
      </Panel>
      <TwoColumn>
        <Panel title="合规用户">
          <div className="stack">
            <DataTable
              rows={users}
              loading={loading} error={readErrors.users} emptyText="当前条件下没有合规用户"
              rowActionLabel="查看用户合规详情"
              isSelected={row => String(row.userId) === selectedUserId}
              columns={["userId", "username", "userStatus", "kycLevel", "kycStatus", "country", "activeRiskTags", "openAmlCases", "updatedAt"]}
              onRowClick={(row) => void loadDetail(String(row.userId ?? ""))}
              mobileAction={{
                label: "打开详情",
                onClick: (row) => void loadDetail(String(row.userId ?? ""))
              }}
            />
            <CursorPager
              page={pageInfo}
              loading={loading || Boolean(readErrors.users)}
              cursor={filters.cursor}
              onNext={() => void load(pageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
        <Panel title={selectedUserId ? `用户合规详情 · ${selectedUserId}` : "用户合规详情"}>
          {detailLoading ? <div className="empty" role="status" aria-busy="true">正在加载用户 {selectedUserId} 的资料…</div>
          : detailError ? <div className="alert danger" role="alert">{detailError}<button onClick={() => void loadDetail(selectedUserId)}>重新加载当前用户</button></div>
          : detail ? (
            <div className="stack" ref={detailFocus} tabIndex={-1} aria-label={`用户 ${selectedUserId} 合规资料`}>
              <KeyValue data={(detail.user as UnknownRecord) ?? {}} />
              {detail.kyc ? <KeyValue data={detail.kyc as UnknownRecord} /> : <Empty text="该用户尚无 KYC 认证档案" />}
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
              loading={loading || Boolean(readErrors.tags)}
              cursor={riskTagFilters.cursor}
              onNext={() => void load(filters.cursor, riskTagPageInfo.nextCursor || "", amlCaseFilters.cursor)}
              onReset={() => void load(filters.cursor, "", amlCaseFilters.cursor)}
            />
            <DataTable
              rows={globalRiskTags}
              loading={loading} error={readErrors.tags}
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
              loading={loading || Boolean(readErrors.cases)}
              cursor={amlCaseFilters.cursor}
              onNext={() => void load(filters.cursor, riskTagFilters.cursor, amlCasePageInfo.nextCursor || "")}
              onReset={() => void load(filters.cursor, riskTagFilters.cursor, "")}
            />
            <DataTable
	              rows={globalAmlCases}
              loading={loading} error={readErrors.cases}
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
            <Panel title={`KYC 审核 · 用户 ${selectedUserId}`}>
              <div className="stack">
                <div className="form-grid">
                  <label>KYC Level<select value={kycForm.kycLevel} onChange={(event) => updateKycForm({ kycLevel: event.target.value })}>{KYC_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>状态<select aria-label="KYC 审核状态" value={kycForm.status} onChange={(event) => updateKycForm({ status: event.target.value })}>{KYC_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="国家/地区" value={kycForm.country} onChange={(value) => updateKycForm({ country: value.toUpperCase() })} />
                  <TextFilter label="证件类型" value={kycForm.documentType} onChange={(value) => updateKycForm({ documentType: value.toUpperCase() })} />
                  <TextFilter label="Provider" value={kycForm.provider} onChange={(value) => updateKycForm({ provider: value })} />
                  <TextFilter label="Provider Ref" value={kycForm.providerReference} onChange={(value) => updateKycForm({ providerReference: value })} />
                  <TextFilter label="过期时间 ISO" value={kycForm.expiresAt} onChange={(value) => updateKycForm({ expiresAt: value })} />
                </div>
                <p className="muted">通过前核对本次提交的原件并设置有效期；有效期不能超过证件期限。驳回须填写用户可理解的补正原因。第三方认证等级由实际核验流程决定。</p>
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
              {previewLoading && <div className="alert" role="status">正在读取原件…<button onClick={() => { previewRequest.current?.abort(); setPreviewLoading(false); }}>取消读取</button></div>}
              {kycDocuments.length === 0 ? <Empty text="当前用户尚未上传材料" /> : (
                <div className="stack kyc-document-list">
                  {kycDocuments.map((document) => (
                    <div className="kyc-document-item" key={fieldText(document.documentId)}>
                      <div className="kyc-document-meta">
                        <strong>{fieldText(document.originalFilename) || "未命名材料"}</strong>
                        <span>{fieldText(document.documentType)} · {fieldText(document.contentType)} · {compactNumber(document.fileSize)} bytes</span>
                        <span>状态：{fieldText(document.status)} · SHA-256：{fieldText(document.sha256).slice(0, 16)}…</span>
                      </div>
                      <button disabled={previewLoading} onClick={() => void openKycDocument(document)}><Eye size={15} />查看原件</button>
                    </div>
                  ))}
                </div>
              )}
              {kycPreview && (
                <dialog ref={kycPreviewRef} className="kyc-document-preview" aria-label={`原件预览：${kycPreview.filename}`} onCancel={() => setKycPreview(null)}>
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
                  <p className="muted">用户 {selectedUserId} · 仅供本次合规审核，请妥善处理原始材料。</p>
                  {kycPreview.contentType.startsWith("application/pdf") ? (
                    <iframe tabIndex={-1} title={`KYC 原件：${kycPreview.filename}`} src={kycPreview.url} />
                  ) : (
                    <img src={kycPreview.url} alt={`KYC 原件：${kycPreview.filename}`} />
                  )}
                </dialog>
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
      </fieldset>
    </Page>
  );
}

function kycFormTemplate() {
  return {
    kycLevel: "BASIC",
    status: "PENDING",
    country: "",
    documentType: "",
    provider: "SELF",
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
    provider: fieldText(row.provider) || "SELF",
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
