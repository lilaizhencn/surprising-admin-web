// Local controlled identity; the complete console, approval dialog, content API and database are real.
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { saveSession } from "../../src/api/client";
import "../../src/tokens.css";
import "../../src/styles.css";
saveSession({ user: { userId: "9", username: "content-qa-admin", email: "qa@example.test", status: "NORMAL", createdAt: new Date().toISOString(), roles: ["SUPER_ADMIN"] },
  accessToken: "content-qa-admin", refreshToken: "qa-only", accessTokenExpiresAt: new Date(Date.now()+3600_000).toISOString(), refreshTokenExpiresAt: new Date(Date.now()+7200_000).toISOString() });
createRoot(document.getElementById("root")!).render(<App />);
