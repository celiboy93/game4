// shared.ts

export const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "hardcoded_admin_pass"; 
export const SESSION_COOKIE_NAME = "session_id";
export const TIMEZONE = "Asia/Yangon";
export const RATE_LIMIT_WINDOW_MS = 60000; 
export const MAX_REQUESTS_PER_WINDOW = 5;

export const TIER_THRESHOLDS = {
    "Bronze": 0,
    "Silver": 50000,
    "Gold": 200000
} as const;

// --- Interfaces ---
export interface User {
    username: string;
    passwordHash: string;
    balance: number;
    isBlocked?: boolean; 
    receivedBonus?: boolean;
    lifetimeSpend: number | undefined; 
    tier: keyof typeof TIER_THRESHOLDS | undefined; 
}
export interface Transaction {
    type: "topup" | "purchase";
    amount: number;
    timestamp: string; 
    itemName?: string; 
    itemDetails?: string; 
    isRolledBack?: boolean; 
}
export interface DigitalSaleLog {
    username: string;
    itemName?: string;
    itemDetails?: string;
    timestamp: string;
    amount: number;
}
export interface Product {
    id: string; 
    name: string; 
    price: number; 
    salePrice?: number | null;
    imageUrl: string; 
    isDigital: boolean; 
    isSharedStock: boolean;
    stock: string[]; 
    category: string; 
}
export interface Voucher {
    code: string; 
    value: number; 
    isUsed: boolean; 
    generatedAt: string;
}
export interface Announcement { message: string; }
export interface PaymentInfo {
    instructions: string;
    telegramUser: string;
    kpayLogoUrl: string;
    kpayNumber: string;
    kpayName: string;
    waveLogoUrl: string;
    waveNumber: string;
    waveName: string;
}
export interface GlobalBonus { isActive: boolean; amount: number; }

// --- Helpers ---
export function formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US');
}

export function formatTime(utcString: string): string {
    try { return new Date(utcString).toLocaleString("en-US", { timeZone: TIMEZONE, hour12: true }); } 
    catch (e) { return utcString; }
}

export function calculateTier(spend: number): User['tier'] {
    if (spend >= TIER_THRESHOLDS.Gold) return "Gold";
    if (spend >= TIER_THRESHOLDS.Silver) return "Silver";
    return "Bronze";
}

export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyHash(inputPassword: string, storedHash: string): Promise<boolean> {
    const inputHash = await hashPassword(inputPassword);
    return inputHash === storedHash;
}
