import { Page } from "../components/AdminUi";
import { ProductLineAccess } from "../ProductLineAccess";

export default function ProductLinesPage() {
  return (
    <Page
      title="产品线管理"
      description="统一管理各交易产品线的 Gateway 运行时接入、连接状态与启用开关。"
    >
      <ProductLineAccess />
    </Page>
  );
}
