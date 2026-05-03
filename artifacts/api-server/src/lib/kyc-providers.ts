/**
 * KYC provider adapter interface.
 *
 * Future providers (DigiLocker, Aadhaar OTP, Karza, etc.) implement this
 * interface and replace the default ManualKYCProvider. The route layer is
 * provider-agnostic — it persists the provider name and any opaque
 * providerRef / providerData returned here.
 */
export interface KYCVerifyInput {
  idType: string;
  idNumber: string;
  idImageFront?: string | null;
  idImageBack?: string | null;
  selfieImage?: string | null;
  residentName?: string;
}

export interface KYCVerifyResult {
  status: "PENDING" | "VERIFIED" | "REJECTED";
  providerRef?: string | null;
  providerData?: Record<string, unknown> | null;
  rejectionReason?: string | null;
}

export interface KYCProvider {
  name: string;
  verify(input: KYCVerifyInput): Promise<KYCVerifyResult>;
}

/**
 * Default no-op provider — leaves request in PENDING for manual admin review.
 * Real providers should perform live verification and return VERIFIED/REJECTED.
 */
export const ManualKYCProvider: KYCProvider = {
  name: "MANUAL",
  async verify() {
    return { status: "PENDING", providerRef: null, providerData: null };
  },
};

const PROVIDERS: Record<string, KYCProvider> = {
  MANUAL: ManualKYCProvider,
};

export function getKYCProvider(name?: string | null): KYCProvider {
  if (!name) return ManualKYCProvider;
  return PROVIDERS[name.toUpperCase()] ?? ManualKYCProvider;
}
