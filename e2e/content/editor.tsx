// Local UI harness. Identity is controlled; announcement/R2 calls use ContentQaServer and PostgreSQL.
import { createRoot } from "react-dom/client";
import AnnouncementsPage from "../../src/AnnouncementsPage";
import { setApprovalRequestHandler } from "../../src/api/admin";
import { saveSession } from "../../src/api/client";
import "../../src/tokens.css";
import "../../src/styles.css";
saveSession({ user: { userId: "9", username: "content-qa-admin", email: "qa@example.test", status: "NORMAL", createdAt: new Date().toISOString(), roles: ["SUPER_ADMIN"] },
  accessToken: "content-qa-admin", refreshToken: "qa-only", accessTokenExpiresAt: new Date(Date.now()+3600_000).toISOString(), refreshTokenExpiresAt: new Date(Date.now()+7200_000).toISOString() });
setApprovalRequestHandler(async () => ({ approvalId: "content-qa-controlled-approval" }));
createRoot(document.getElementById("root")!).render(<main style={{ padding: 20 }}><AnnouncementsPage /></main>);
