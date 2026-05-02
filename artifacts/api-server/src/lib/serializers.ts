import type {
  User,
  Service,
  Country,
  PaymentMethod,
  VirtualNumber,
  SmsMessage,
  Transaction,
} from "@workspace/db";

export function toUser(
  user: User,
  totals?: { totalSpent: number; transactionsCount: number },
) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    username: user.username ?? undefined,
    balance: user.balance,
    verified: user.verified,
    status: user.status,
    isAdmin: user.isAdmin,
    riskScore: user.riskScore,
    createdAt: user.createdAt.toISOString(),
    totalSpent: totals?.totalSpent ?? 0,
    transactionsCount: totals?.transactionsCount ?? 0,
  };
}

export function toService(s: Service) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    scope: s.scope,
    price: s.price,
    available: s.available,
    color: s.color,
    category: s.category,
    popular: s.popular,
  };
}

export function toCountry(c: Country) {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    dialCode: c.dialCode,
    flag: c.flag,
    available: c.available,
    price: c.price,
    popular: c.popular,
  };
}

export function toPaymentMethod(pm: PaymentMethod) {
  return {
    id: pm.id,
    name: pm.name,
    slug: pm.slug,
    description: pm.description,
    color: pm.color,
    logoUrl: pm.logoUrl ?? null,
    recommended: pm.recommended,
  };
}

export function toMessage(m: SmsMessage) {
  return {
    id: m.id,
    sender: m.sender,
    body: m.body,
    code: m.code,
    receivedAt: m.receivedAt.toISOString(),
  };
}

export function toTransaction(t: Transaction) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    status: t.status,
    method: t.method ?? undefined,
    description: t.description ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

export function toNumber(
  n: VirtualNumber,
  service: Service,
  country: Country,
  messages: SmsMessage[],
) {
  return {
    id: n.id,
    phoneNumber: n.phoneNumber,
    status: n.status,
    expiresAt: n.expiresAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
    price: n.price,
    service: toService(service),
    country: toCountry(country),
    messages: messages.map(toMessage),
  };
}
