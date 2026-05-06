import 'server-only';
import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago';

const DEFAULT_MP_TIMEOUT_MS = 10_000;

type PreApprovalCreateBody = Parameters<PreApproval['create']>[0]['body'];
type PreApprovalUpdateBody = Parameters<PreApproval['update']>[0]['body'];

let cachedToken: string | null = null;
let cachedClient: MercadoPagoConfig | null = null;
let cachedPreApproval: PreApproval | null = null;
let cachedPayment: Payment | null = null;

export interface PreapprovalRequest {
    reason: string;
    externalReference: string;
    payerEmail: string;
    transactionAmountArs: number;
    backUrl: string;
    notificationUrl?: string;
}

export interface PreapprovalResponse {
    id: string;
    initPoint: string;
    status: string;
    raw: unknown;
}

export interface PreapprovalDetails {
    id: string;
    status: string;
    externalReference: string | null;
    payerId: string | number | null;
    payerEmail: string | null;
    nextPaymentDate: string | null;
    autoRecurring: {
        currencyId: string;
        transactionAmount: number;
        frequency: number;
        frequencyType: string;
    } | null;
    raw: unknown;
}

export interface PaymentDetails {
    id: string | number;
    status: string;
    statusDetail: string | null;
    externalReference: string | null;
    transactionAmount: number | null;
    currencyId: string | null;
    payerEmail: string | null;
    raw: unknown;
}

function getAccessToken(): string {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
        throw new Error('MP_ACCESS_TOKEN no esta configurado.');
    }
    return token;
}

export function getMercadoPagoClient(): MercadoPagoConfig {
    const token = getAccessToken();
    if (!cachedClient || cachedToken !== token) {
        cachedToken = token;
        cachedClient = new MercadoPagoConfig({
            accessToken: token,
            options: {
                timeout: DEFAULT_MP_TIMEOUT_MS,
            },
        });
        cachedPreApproval = null;
        cachedPayment = null;
    }
    return cachedClient;
}

function getPreApprovalClient(): PreApproval {
    if (!cachedPreApproval) {
        cachedPreApproval = new PreApproval(getMercadoPagoClient());
    }
    return cachedPreApproval;
}

function getPaymentClient(): Payment {
    if (!cachedPayment) {
        cachedPayment = new Payment(getMercadoPagoClient());
    }
    return cachedPayment;
}

function getSdkErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const message = typeof record.message === 'string'
            ? record.message
            : typeof record.error === 'string'
                ? record.error
                : fallback;
        const status = record.status ?? record.status_code;
        const statusText = typeof status === 'number' || typeof status === 'string'
            ? `status ${status}`
            : null;

        return [message, statusText].filter(Boolean).join(' - ');
    }

    return fallback;
}

export function getUsdToArsRate(): number {
    const raw = process.env.MP_USD_TO_ARS_RATE;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    // Fallback conservador (ajustá MP_USD_TO_ARS_RATE en .env.local).
    return 1100;
}

export function usdToArs(amountUsd: number): number {
    return Math.round(amountUsd * getUsdToArsRate());
}

export async function createPreapproval(
    input: PreapprovalRequest
): Promise<PreapprovalResponse> {
    const body = {
        reason: input.reason,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        notification_url: input.notificationUrl,
        auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: input.transactionAmountArs,
            currency_id: 'ARS',
        },
        status: 'pending',
    };

    let response;
    try {
        response = await getPreApprovalClient().create({
            body: body as PreApprovalCreateBody,
            requestOptions: {
                idempotencyKey: `g22-preapproval-${input.externalReference}`,
            },
        });
    } catch (error) {
        throw new Error(`createPreapproval failed: ${getSdkErrorMessage(error, 'Mercado Pago SDK error')}`);
    }

    if (!response.id || !response.init_point) {
        throw new Error(
            `createPreapproval failed: missing id/init_point (${response.api_response?.status ?? 'unknown'})`
        );
    }

    return {
        id: String(response.id),
        initPoint: String(response.init_point),
        status: String(response.status || 'pending'),
        raw: response,
    };
}

export async function getPreapproval(id: string): Promise<PreapprovalDetails> {
    let response;
    try {
        response = await getPreApprovalClient().get({ id });
    } catch (error) {
        throw new Error(`getPreapproval failed: ${getSdkErrorMessage(error, 'Mercado Pago SDK error')}`);
    }

    if (!response.id) {
        throw new Error(`getPreapproval failed: missing id (${response.api_response?.status ?? 'unknown'})`);
    }

    return {
        id: String(response.id),
        status: String(response.status || 'pending'),
        externalReference: response.external_reference ? String(response.external_reference) : null,
        payerId: response.payer_id ?? null,
        payerEmail: response.payer_email ?? null,
        nextPaymentDate: response.next_payment_date ?? null,
        autoRecurring: response.auto_recurring
            ? {
                currencyId: String(response.auto_recurring.currency_id || 'ARS'),
                transactionAmount: Number(response.auto_recurring.transaction_amount || 0),
                frequency: Number(response.auto_recurring.frequency || 1),
                frequencyType: String(response.auto_recurring.frequency_type || 'months'),
            }
            : null,
        raw: response,
    };
}

export async function getPayment(id: string | number): Promise<PaymentDetails> {
    let response;
    try {
        response = await getPaymentClient().get({ id });
    } catch (error) {
        throw new Error(`getPayment failed: ${getSdkErrorMessage(error, 'Mercado Pago SDK error')}`);
    }

    if (!response.id) {
        throw new Error(`getPayment failed: missing id (${response.api_response?.status ?? 'unknown'})`);
    }

    return {
        id: response.id,
        status: String(response.status || ''),
        statusDetail: response.status_detail ?? null,
        externalReference: response.external_reference ?? null,
        transactionAmount: response.transaction_amount ?? null,
        currencyId: response.currency_id ?? null,
        payerEmail: response.payer?.email ?? null,
        raw: response,
    };
}

export async function cancelPreapproval(id: string): Promise<void> {
    try {
        await getPreApprovalClient().update({
            id,
            body: { status: 'cancelled' } as PreApprovalUpdateBody,
            requestOptions: {
                idempotencyKey: `g22-cancel-preapproval-${id}`,
            },
        });
    } catch (error) {
        throw new Error(`cancelPreapproval failed: ${getSdkErrorMessage(error, 'Mercado Pago SDK error')}`);
    }
}
