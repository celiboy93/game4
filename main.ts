import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { setCookie, getCookies, deleteCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();
const ADMIN_USERNAME = "admin"; 

// --- NATIVE HASHING HELPERS ---

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return bufferToHex(salt.buffer);
}

async function hashPassword(password: string): Promise<{hash: string, salt: string}> {
    const salt = generateSalt();
    const data = new TextEncoder().encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return { hash: bufferToHex(hashBuffer), salt: salt };
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    const data = new TextEncoder().encode(password + storedSalt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const newHash = bufferToHex(hashBuffer);
    return newHash === storedHash;
}

// --- STOCK FETCHING HELPER ---

async function fetchExternalStock(apiUrl: string) {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) return [];

        const data = await response.json();
        
        const availableItems = Array.isArray(data) 
            ? data.filter((item: any) => item.status === "available" || item.status === "active" || item.status === "Available" || item.status === "true")
            : [];
            
        return availableItems;
    } catch (e) {
        console.error("External API Fetch Failed:", e);
        return [];
    }
}

// --- MAIN SERVER LOGIC ---

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cookies = getCookies(req.headers);
  const sessionUser = cookies.user_session || null;

  // SECURITY & ADMIN CHECK
  if (url.pathname.startsWith("/api/admin/")) {
    if (sessionUser !== ADMIN_USERNAME) return new Response("Unauthorized", { status: 403 });
  }

  // ROUTING
  if (url.pathname === "/login") return serveFile(req, "./static/login.html");
  if (!sessionUser && (url.pathname === "/" || url.pathname === "/profile")) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }

  if (url.pathname === "/") return serveFile(req, "./static/shop.html"); 
  if (url.pathname === "/profile") return serveFile(req, "./static/profile.html");
  if (url.pathname.startsWith("/static/")) return serveFile(req, "." + url.pathname);

  // --- API: AUTH ---
  if (req.method === "POST" && url.pathname.includes("/api/auth/register")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const check = await kv.get(["users", u]);
    if (check.value) return new Response("Exists", { status: 400 });

    const { hash, salt } = await hashPassword(body.password);
    await kv.set(["users", u], { username: u, hash: hash, salt: salt, balance: 0 });
    return new Response("Created");
  }

  if (req.method === "POST" && url.pathname.includes("/api/auth/login")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const userRes = await kv.get(["users", u]);
    const user = userRes.value;

    if (!user) return new Response("Fail", { status: 401 });

    const passwordMatch = await verifyPassword(body.password, user.hash, user.salt);
    if (!passwordMatch) return new Response("Fail", { status: 401 });

    const res = new Response("Logged In");
    setCookie(res.headers, { name: "user_session", value: u, path: "/", maxAge: 86400 });
    return res;
  }

  if (url.pathname === "/api/auth/logout") {
    const res = new Response(null, { status: 302, headers: { Location: "/login" } });
    deleteCookie(res.headers, "user_session");
    return res;
  }

  if (url.pathname === "/api/me") {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const user = await kv.get(["users", sessionUser]);
    return new Response(JSON.stringify(user.value), { headers: { "content-type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.includes("/api/auth/change-password")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const { old_password, new_password } = body;

    const userRes = await kv.get(["users", sessionUser]);
    const user = userRes.value;
    
    const match = await verifyPassword(old_password, user.hash, user.salt);
    if (!match) return new Response("Incorrect old password", { status: 401 });

    const { hash, salt } = await hashPassword(new_password);
    user.hash = hash;
    user.salt = salt;
    
    await kv.set(["users", sessionUser], user);
    return new Response("Password changed successfully");
  }

  // --- SHOP & ADMIN API (HYBRID LOGIC) ---
  
  if (url.pathname.startsWith("/api/items")) {
    const apiRes = await kv.get(["settings", "external_api_url"]);
    const externalApiUrl = apiRes.value;

    const itemEntries = kv.list({ prefix: ["items"] });
    const items = [];
    let externalStockData: any[] | null = null; 

    for await (const entry of itemEntries) {
        const item = entry.value;
        let stockCount = 0;

        if (item.source === 'external' && externalApiUrl) {
             if (!externalStockData) { externalStockData = await fetchExternalStock(externalApiUrl); }
             stockCount = externalStockData.length;
        } else if (item.source === 'internal') {
             stockCount = item.stock ? item.stock.length : 0;
        }

        items.push({ 
            name: item.name, 
            price: item.price, 
            stock: stockCount,
            imageUrl: item.imageUrl,
            source: item.source
        });
    }
    return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
  }

  if (url.pathname.includes("/api/admin/users")) {
    const entries = kv.list({ prefix: ["users"] });
    const users = [];
    for await (const entry of entries) users.push(entry.value);
    return new Response(JSON.stringify(users), { headers: { "content-type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.includes("/api/admin/set-api-url")) {
      const body = await req.json();
      await kv.set(["settings", "external_api_url"], body.url);
      return new Response("API URL Saved.", { status: 200 });
  }

  if (req.method === "POST" && url.pathname.includes("/api/add-item")) {
    const item = await req.json();
    const id = item.name.replace(/\s+/g, '_').toLowerCase();
    
    let itemDataToSave = {
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl || null,
        source: item.source, 
        stock: item.source === 'internal' ? item.stock : [] 
    };

    const res = await kv.atomic()
      .check({ key: ["items", id], version: null })
      .set(["items", id], itemDataToSave)
      .commit();
      
    if (!res.ok) { return new Response("Database write failed due to conflict.", { status: 500 }); }
    return new Response("Item Added", { status: 200 });
  }

  if (req.method === "POST" && url.pathname.includes("/api/admin/topup")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const userRes = await kv.get(["users", u]);
    
    if (!userRes.value) return new Response("User not found", { status: 404 });
    
    const user = userRes.value;
    const amount = parseInt(body.amount);
    
    const res = await kv.atomic()
        .check(userRes) 
        .set(["users", u], { ...user, balance: user.balance + amount })
        .commit();

    if (!res.ok) { return new Response("Topup Failed: Concurrency conflict.", { status: 500 }); }
    return new Response("Topup Success", { status: 200 });
  }

  if (req.method === "POST" && url.pathname.includes("/api/transfer")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const receiverName = body.receiver.toLowerCase();
    const amount = parseInt(body.amount);

    if (receiverName === sessionUser) return new Response("Cannot send to self", { status: 400 });
    if (amount <= 0) return new Response("Invalid amount", { status: 400 });

    const senderRes = await kv.get(["users", sessionUser]);
    const sender = senderRes.value;
    if (sender.balance < amount) return new Response("Insufficient Balance", { status: 400 });

    const receiverRes = await kv.get(["users", receiverName]);
    if (!receiverRes.value) return new Response("Receiver not found", { status: 404 });
    const receiver = receiverRes.value;
    
    const commit = await kv.atomic()
        .check(senderRes)
        .check(receiverRes)
        .set(["users", sessionUser], { ...sender, balance: sender.balance - amount })
        .set(["users", receiverName], { ...receiver, balance: receiver.balance + amount })
        .commit();
        
    if (!commit.ok) { return new Response("Transfer Failed: Concurrency/Balance Check Error.", { status: 500 }); }

    return new Response("Transfer Success", { status: 200 });
  }
  
  if (req.method === "POST" && url.pathname.includes("/api/redeem")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const code = body.code;

    const voucherRes = await kv.get(["vouchers", code]);
    if (!voucherRes.value) return new Response("Invalid Voucher", { status: 404 });
    
    const voucher = voucherRes.value;
    if (voucher.used >= voucher.limit) return new Response("Voucher Fully Used", { status: 400 });

    const userRes = await kv.get(["users", sessionUser]);
    const user = userRes.value;
    
    const result = await kv.atomic()
        .check(userRes)
        .check(voucherRes)
        .set(["users", sessionUser], { ...user, balance: user.balance + voucher.amount })
        .set(["vouchers", code], { ...voucher, used: voucher.used + 1 })
        .commit();

    if (!result.ok) { return new Response("Redeem Failed: Concurrency Error.", { status: 500 }); }

    return new Response(JSON.stringify({ amount: voucher.amount }), { headers: { "content-type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.includes("/api/buy")) {
    if (!sessionUser) return new Response(JSON.stringify({ error: "Login Required" }), { status: 401 });

    const body = await req.json();
    const itemId = body.itemName.replace(/\s+/g, '_').toLowerCase();
    
    const itemRes = await kv.get(["items", itemId]);
    if (!itemRes.value) return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
    let item = itemRes.value;

    let purchasedCode = null;
    
    // HYBRID STOCK DEDUCTION LOGIC
    if (item.source === 'internal') {
        if (item.stock.length === 0) return new Response(JSON.stringify({ error: "Out of Stock!" }), { status: 400 });
        purchasedCode = item.stock[0];
        item.stock = item.stock.slice(1);
        await kv.set(["items", itemId], item); // Save internal stock change
    } else {
        const apiRes = await kv.get(["settings", "external_api_url"]);
        const externalApiUrl = apiRes.value;
        const availableKeys = await fetchExternalStock(externalApiUrl);
        
        if (availableKeys.length === 0) return new Response(JSON.stringify({ error: "External Stock Empty!" }), { status: 400 });

        const randomIndex = Math.floor(Math.random() * availableKeys.length);
        purchasedCode = availableKeys[randomIndex].key;
    }

    const userRes = await kv.get(["users", sessionUser]);
    let user = userRes.value;
    const price = parseInt(item.price.replace(/[^0-9]/g, ''));

    if (user.balance < price) return new Response(JSON.stringify({ error: "Insufficient Balance" }), { status: 400 });

    user.balance -= price;

    await kv.set(["users", sessionUser], user);

    const record = {
      itemName: item.name,
      code: purchasedCode,
      price: item.price,
      date: new Date().toLocaleString()
    };
    await kv.set(["history", sessionUser, Date.now()], record);

    return new Response(JSON.stringify({ success: true, code: purchasedCode }), { headers: { "content-type": "application/json" } });
  }

  if (url.pathname.includes("/api/history")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const entries = kv.list({ prefix: ["history", sessionUser] });
    const history = [];
    for await (const entry of entries) history.push(entry.value);
    return new Response(JSON.stringify(history.reverse()), { headers: { "content-type": "application/json" } });
  }

  return new Response("Not Found", { status: 404 });
});
