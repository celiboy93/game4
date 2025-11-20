// main.ts
import { ADMIN_TOKEN, SESSION_COOKIE_NAME, hashPassword, verifyHash } from "./shared.ts";
import * as DB from "./db.ts";
import * as Views from "./views.ts";

async function handleAuth(formData: FormData): Promise<Response> {
    const username = formData.get("username")?.toString();
    const password = formData.get("password")?.toString();
    const remember = formData.get("remember") === "on";

    if (!username || !password) return new Response("Redirecting...", { status: 302, headers: { "Location": "/login?error=missing" } });
    
    const user = await DB.getUserByUsername(username);
    if (!user || user.isBlocked) return new Response("Redirecting...", { status: 302, headers: { "Location": "/login?error=invalid" } });
    
    let match = false;
    if (user.passwordHash.length === 64) match = await verifyHash(password, user.passwordHash);
    else match = password === user.passwordHash;

    if (!match) return new Response("Redirecting...", { status: 302, headers: { "Location": "/login?error=invalid" } });

    const bonus = await DB.getGlobalBonus();
    if (bonus && bonus.isActive && !user.receivedBonus) {
        await DB.updateUserBalance(username, bonus.amount);
        const u = (await DB.getUserByUsername(username))!;
        await DB.kv.set(["users", username], { ...u, receivedBonus: true });
        await DB.logTransaction(username, bonus.amount, "topup", "Event Bonus");
    }
    
    const token = await DB.createSession(username, remember);
    const headers = new Headers({ "Location": "/dashboard" });
    const maxAge = remember ? 2592000 : 3600;
    headers.set("Set-Cookie", `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`);
    return new Response("Redirecting...", { status: 302, headers });
}

async function handleRegister(formData: FormData): Promise<Response> {
    const username = formData.get("username")?.toString();
    const password = formData.get("password")?.toString();
    if (!username || !password) return new Response("Error", { status: 400 });

    if (await DB.registerUser(username, await hashPassword(password))) {
        const token = await DB.createSession(username, true);
        const headers = new Headers({ "Location": "/dashboard" });
        headers.set("Set-Cookie", `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${3600}; HttpOnly; SameSite=Lax`);
        return new Response("Success", { status: 302, headers });
    }
    return new Response("Redirecting...", { status: 302, headers: { "Location": "/register?error=exists" } });
}

async function handleBuy(formData: FormData, username: string): Promise<Response> {
    if (!await DB.checkRateLimit(username)) return Views.renderMessagePage("Rate Limit", "Please wait a moment.", true);
    
    const productId = formData.get("productId")?.toString();
    if (!productId) return Views.renderMessagePage("Error", "Invalid Item", true);
    
    const productRes = await DB.getProductById(productId);
    if (!productRes || !productRes.value) return Views.renderMessagePage("Error", "Item Not Found", true);
    
    const product = productRes.value;
    const user = (await DB.getUserByUsername(username))!;
    const price = (product.salePrice !== null && product.salePrice >= 0) ? product.salePrice : product.price;

    if (price > 0 && user.balance < price) return Views.renderMessagePage("Error", "Insufficient Balance", true);

    let itemDetails: string | undefined;
    if (product.isDigital) {
        if (!product.stock.length && !product.isSharedStock) return Views.renderMessagePage("Error", "Out of Stock", true);
        itemDetails = product.stock[0];
        const newStock = product.isSharedStock ? product.stock : product.stock.slice(1);
        await DB.addOrUpdateProduct({ ...product, stock: newStock }); 
    }

    if (await DB.updateUserBalance(username, -price)) {
        await DB.logTransaction(username, -price, "purchase", product.name, itemDetails);
        await DB.updateUserSpendAndTier(username, price);
        return Views.renderMessagePage("Success", `Purchased ${product.name}`, false);
    }
    return Views.renderMessagePage("Error", "Transaction Failed", true);
}

async function authenticate(req: Request) {
    const cookie = req.headers.get("Cookie");
    if (!cookie || !cookie.includes(SESSION_COOKIE_NAME)) return null;
    const token = decodeURIComponent(cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))![1].split(';')[0]);
    const username = await DB.getUsernameFromSession(token);
    if (!username) return null;
    return await DB.getUserByUsername(username);
}

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET") {
        if (path === "/login") return Views.renderLoginForm(req);
        if (path === "/register") return Views.renderRegisterForm(req);
        if (path === "/logout") {
            const cookie = req.headers.get("Cookie");
            if(cookie) {
                const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
                if(match) await DB.deleteSession(match[1].split(';')[0]);
            }
            return new Response("Bye", { status: 302, headers: { "Location": "/login", "Set-Cookie": `${SESSION_COOKIE_NAME}=; Max-Age=0` } });
        }
        
        if (path.startsWith("/admin/")) {
            const token = url.searchParams.get("token");
            if (token !== ADMIN_TOKEN) return Views.renderMessagePage("Error", "Unauthorized", true);
            if (path === "/admin/panel") return Views.renderAdminPanel(token, url.searchParams.get("message"));
        }

        const user = await authenticate(req);
        if (!user) return new Response("Redirect", { status: 302, headers: { "Location": "/login" } });
        if (path === "/" || path === "/dashboard") return Views.handleDashboard(req, user);
        if (path === "/user-info") return Views.handleUserInfoPage(req, user);
    }

    if (req.method === "POST") {
        const formData = await req.formData();
        if (path === "/auth") return handleAuth(formData);
        if (path === "/doregister") return handleRegister(formData);

        const user = await authenticate(req);
        if (user && !user.isBlocked) {
            if (path === "/buy") return handleBuy(formData, user.username);
            if (path === "/transfer_funds") {
                const res = await DB.transferBalance(user.username, formData.get("recipient_name")!.toString(), parseInt(formData.get("transfer_amount")!.toString()));
                return new Response("", { status: 302, headers: { "Location": `/user-info?${res === "success" ? "message=Success" : "error="+res}` } });
            }
            if (path === "/redeem_voucher") {
                const code = formData.get("code")?.toString().toUpperCase() || "";
                const v = await DB.getVoucherByCode(code);
                if(v && v.value && !v.value.isUsed && await DB.markVoucherUsed(v)) {
                    await DB.updateUserBalance(user.username, v.value.value);
                    await DB.logTransaction(user.username, v.value.value, "topup", `Voucher: ${code}`);
                    return new Response("", { status: 302, headers: { "Location": "/user-info?message=Redeemed" } });
                }
                return new Response("", { status: 302, headers: { "Location": "/user-info?error=Invalid Voucher" } });
            }
        }

        if (formData.get("token") === ADMIN_TOKEN) {
            const token = ADMIN_TOKEN;
            const back = `/admin/panel?token=${token}`;
            if (path === "/admin/add_product") {
                await DB.addOrUpdateProduct({
                    id: Date.now().toString(), name: formData.get("name")!.toString(), price: parseInt(formData.get("price")!.toString()),
                    imageUrl: formData.get("imageUrl")!.toString(), isDigital: formData.get("isDigital") === "on", stock: (formData.get("stock")?.toString()||"").split('\n'),
                    category: formData.get("category")!.toString(), isSharedStock: formData.get("isSharedStock") === "on", salePrice: null
                });
            }
            if (path === "/admin/delete_product") await DB.deleteProduct(formData.get("productId")!.toString());
            if (path === "/admin/create_voucher") await DB.generateVoucher(parseInt(formData.get("amount")!.toString()));
            if (path === "/admin/adjust_balance") await DB.updateUserBalance(formData.get("name")!.toString(), parseInt(formData.get("amount")!.toString()));
            if (path === "/admin/toggle_block") await DB.toggleBlockUser(formData.get("name")!.toString());

            return new Response("Done", { status: 302, headers: { "Location": back } });
        }
    }

    return new Response("Not Found", { status: 404 });
}

console.log("Server running...");
Deno.serve(handler);
