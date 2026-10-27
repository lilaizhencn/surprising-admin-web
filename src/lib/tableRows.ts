import type { UnknownRecord } from "../types"

const identityFields = [
  "auditId",
  "announcementId",
  "id",
  "appealId",
  "orderId",
  "triggerOrderId",
  "withdrawalId",
  "exportId",
  "queryTaskId",
  "alertEventId",
  "approvalId",
  "adId",
  "accountId",
  "feeScheduleId",
  "candidateId",
  "ticketId",
  "sessionId",
  "roleCode",
  "ruleCode",
  "channelCode",
  "instrumentId",
  "userId",
]
const columnLabels: Readonly<Record<string, string>> = {
  approvalId: "审批 ID",
  requesterUserId: "申请人 ID",
  requesterUsername: "申请人",
  httpMethod: "请求方法",
  requestPath: "请求路径",
  service: "服务",
  announcementId: "公告 ID",
  auditId: "审计 ID",
  title: "标题",
  category: "类型",
  displayStatus: "生效状态",
  targets: "投放范围",
  startsAt: "生效时间",
  adminUserId: "管理员 ID",
  adminUsername: "管理员",
  action: "操作",
  withdrawalId: "提现申请 ID",
  assetSymbol: "资产",
  chain: "网络",
  amount: "金额",
  toAddress: "收款地址",
  userId: "用户 ID",
  username: "用户名",
  email: "邮箱",
  phone: "手机号",
  roles: "角色",
  status: "状态",
  userStatus: "用户状态",
  productLine: "产品线",
  instrumentId: "合约 ID",
  symbol: "交易对",
  instrumentType: "产品类型",
  contractType: "合约类型",
  settleAsset: "结算资产",
  orderId: "订单 ID",
  triggerOrderId: "条件单 ID",
  side: "买卖方向",
  positionSide: "持仓方向",
  orderType: "订单类型",
  priceTicks: "价格 (ticks)",
  quantitySteps: "数量 (steps)",
  remainingQuantitySteps: "剩余数量 (steps)",
  asset: "资产",
  accountType: "账户类型",
  balance: "余额",
  availableUnits: "可用 (最小单位)",
  lockedUnits: "冻结 (最小单位)",
  createdAt: "创建时间",
  updatedAt: "更新时间",
  expiryTime: "到期时间",
  deliveryTime: "交割时间",
  requestedAt: "申请时间",
  finishedAt: "完成时间",
  expiresAt: "过期时间",
  makerFeeRatePpm: "Maker 费率 (ppm)",
  takerFeeRatePpm: "Taker 费率 (ppm)",
  maxLeveragePpm: "杠杆上限 (ppm)",
  exportId: "导出 ID",
  queryTaskId: "查询任务 ID",
  queryType: "查询类型",
  rowCount: "记录数",
  byteSize: "文件大小 (bytes)",
  requestedByUsername: "申请人",
  errorMessage: "错误原因",
  roleCode: "角色代码",
  roleName: "角色名称",
  permissionCount: "权限数",
  adId: "广告 ID",
  accountId: "收款账户 ID",
  appealId: "申诉 ID",
  nickname: "昵称",
  makerUserId: "商家 ID",
  openerUserId: "发起人 ID",
  methodCode: "收款方式",
  maskedLabel: "收款账号",
  fiat: "法币",
  kycStatus: "身份认证",
  bondStatus: "质押状态",
  bondAmount: "质押金额",
  bondAsset: "质押资产",
  c2cStatus: "状态",
  c2cKycStatus: "身份认证",
  c2cBondStatus: "质押状态",
  c2cMarket: "市场",
  c2cPrice: "单价",
  c2cAvailable: "可交易数量",
  permissionCode: "权限代码",
  permissionName: "权限名称",
  description: "说明",
  enabled: "是否启用",
  reason: "原因",
}

export function tableColumnLabel(column: string): string {
  return columnLabels[column] ?? column
}

export function tableRowIdentity(row: UnknownRecord, index: number): string {
  for (const key of identityFields) {
    const value = row[key]
    if ((typeof value === "string" && value !== "") || typeof value === "number")
      return `${String(row.productLine ?? "")}:${key}:${value}`
  }
  return `row:${index + 1}`
}

export function tableRowLabel(row: UnknownRecord, index: number): string {
  if (typeof row.symbol === "string" && row.symbol) return row.symbol
  for (const key of identityFields) {
    const value = row[key]
    if ((typeof value === "string" && value !== "") || typeof value === "number")
      return `${tableColumnLabel(key)} ${value}`
  }
  return `第 ${index + 1} 条`
}

export function tableRowKeys(rows: UnknownRecord[]): string[] {
  const keys = rows.map(tableRowIdentity)
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return keys.map((key, index) => (counts.get(key) === 1 ? key : `${key}:row:${index + 1}`))
}
