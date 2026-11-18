import { lazy, Suspense, useEffect, useState } from "react";
import { TabBar } from "../components/AdminUi";

const AnnouncementsPage = lazy(() => import("../AnnouncementsPage"));
const TelegramBroadcastPage = lazy(() => import("./TelegramBroadcastPage"));
const LegalPage = lazy(() => import("./LegalPage"));

export type ContentCenterTab = "announcements" | "telegram" | "legal";

export default function ContentCenterPage({
  initialTab = "announcements",
}: {
  initialTab?: ContentCenterTab;
}) {
  const [tab, setTab] = useState<ContentCenterTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div className="stack">
      <TabBar
        label="内容与公告视图"
        active={tab}
        onChange={setTab}
        items={[
          { key: "announcements", label: "站点多语言公告" },
          { key: "telegram", label: "Telegram 频道广播" },
          { key: "legal", label: "用户协议与合规条款" },
        ]}
      />
      <Suspense fallback={<p role="status">正在加载内容模块…</p>}>
        {tab === "announcements" && <AnnouncementsPage />}
        {tab === "telegram" && <TelegramBroadcastPage />}
        {tab === "legal" && <LegalPage />}
      </Suspense>
    </div>
  );
}
