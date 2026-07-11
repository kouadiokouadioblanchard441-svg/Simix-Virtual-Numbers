export { getEmailManager, SUPPORTED_PROVIDERS } from "./manager";
export { encrypt, decrypt, maskApiKey } from "./crypto";
export type {
  EmailPayload,
  SendResult,
  AdapterConfig,
  ProviderAdapter,
  ResolvedProvider,
  ProviderStats,
} from "./types";
