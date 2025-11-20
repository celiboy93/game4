import { Hono } from "jsr:@hono/hono";
import { getCookie, setCookie, deleteCookie } from "jsr:@hono/hono/cookie";
import { kv, User, Product, Transaction, GlobalSale, getUser, updateUser, getProduct, addHistory, isKeySold, markKeyAsSold, getConfig, setConfig, createVoucher, getVoucher, markVoucherUsed, addGlobalSale, processRefund } from "./db.ts";
import { Layout, AuthForm, ProductCard, HistoryTable, MaintenancePage, ProfilePage, TransferPage, AdminUserTable, AdminSalesTable } from "./ui.ts";

const app = new Hono();

// --- NEW: Safe Cursor Helpers (Fixes Myanmar Text Error) ---
function encodeCursor(cursor: any) {
    try {
        // encodeURIComponent fixes the Unicode/Myanmar text issue
        return btoa(encodeURIComponent(JSON.stringify(cursor)));
    } catch {
        return null;
    }
}

function decodeCursor(str: string) {
    try {
        return JSON.parse(decodeURIComponent(atob(str)));
    } catch {
        return undefined;
    }
}

async function getApiAvailableStock(p: Product): Promise<number | string> {
    if (!p.apiUrl) return 0;
    try {
        const res = await fetch(p.apiUrl);
        if (!res.ok) return "?";
        const text = await res.text();
        const json = JSON.parse(text);
        const items = Array.isArray(json) ? json : [json];
        let count = 0;
        for (const item of items) {
            const expDate = new Date(item.expiration_date);
            const now = new Date();
            now.setHours(0,0,0,0);
            if (expDate < now) continue;
            if (item.android_id_1 && item.android_id_1.trim() !== "" && item.android_id_2 && item.android_id_2.trim() !== "") continue;
            if (await isKeySold(item.key)) continue; 
            count++;
        }
        return count;
    } catch { return "?"; }
}

async function getSessionUser(c: any) {
  const sessionUser = getCookie(c, "session_user");
  if (!sessionUser) return null;
  return await getUser(sessionUser);
}

// --- Routes ---

app.get("/", async (c) => {
  const user = await getSessionUser(c);
  const config = await getConfig();
  if (config.maintenance && (!user || !user.isAdmin)) return c.html(MaintenancePage());
  if (!user) return c.redirect("/login");
  if(user.isBlocked) return c.redirect("/logout");
  const iter = kv.list<Product>({ prefix: ["products"] });
  let productsHtml = "";
  for await (const entry of iter) { productsHtml += ProductCard(entry.value); }
  return c.html(Layout("Shop", `
    ${config.maintenance ? '<div class="bg-red-600 text-white text-center py-1 mb-4 rounded font-bold">⚠️ Maintenance Mode Active (Only Admin can see this)</div>' : ''}
    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 class="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Kairizy Store</h1>
        <div class="relative w-full md:w-64"><input type="text" id="searchInput" onkeyup="filterProducts()" placeholder="Search products..." class="w-full bg-slate-800 border border-slate-700 text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pl-10"><div class="absolute left-3 top-2.5 text-slate-400">🔍</div></div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">${productsHtml || '<p class="text-slate-500 col-span-full text-center">No products available yet.</p>'}</div>
  `, user, config.banner));
});

app.get("/transfer", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    return c.html(TransferPage(user));
});

app.post("/transfer", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const body = await c.req.parseBody();
    const receiverName = (body.receiver as string).trim();
    const amount = Number(body.amount);
    if (amount < 500 || amount > 50000) return c.html(TransferPage(user, "Amount must be between 500 and 50,000 Ks"));
    if (receiverName === user.username) return c.html(TransferPage(user, "Cannot transfer to yourself"));
    const receiver = await getUser(receiverName);
    if (!receiver) return c.html(TransferPage(user, "Receiver not found"));
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const senderJoined = user.createdAt || now;
    const receiverJoined = receiver.createdAt || now;
    const isSenderOld = (now - senderJoined) > THIRTY_DAYS;
    const isReceiverOld = (now - receiverJoined) > THIRTY_DAYS;
    const fee = (isSenderOld && isReceiverOld) ? 0 : 50;
    const totalDeduct = amount + fee;
    if (user.balance < totalDeduct) return c.html(TransferPage(user, `Insufficient balance. You need ${totalDeduct.toLocaleString()} Ks (Inc. ${fee} fee)`));
    const res = await kv.atomic().check(await kv.get(["users", user.username])).check(await kv.get(["users", receiverName])).set(["users", user.username], { ...user, balance: user.balance - totalDeduct }).set(["users", receiverName], { ...receiver, balance: receiver.balance + amount }).commit();
    if (!res.ok) return c.html(TransferPage(user, "Transfer failed. Please try again."));
    await addHistory(user.username, "transfer_sent", `To: ${receiverName}`, totalDeduct, fee > 0 ? `Fee: ${fee} Ks` : "Free");
    await addHistory(receiverName, "transfer_received", `From: ${user.username}`, amount, "Received");
    return c.html(ProfilePage({ ...user, balance: user.balance - totalDeduct }, { active: false, amount: 0 }, { type: 'success', text: `Successfully sent ${amount.toLocaleString()} Ks to ${receiverName}` }));
});

app.get("/profile", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    return c.html(ProfilePage(user, { active: config.bonusActive, amount: config.bonusAmount }));
});

app.post("/profile/claim-bonus", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    if (!config.bonusActive || user.hasClaimedBonus) { return c.html(ProfilePage(user, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'error', text: 'Bonus unavailable or already claimed.' })); }
    const newBalance = user.balance + config.bonusAmount;
    await updateUser({ ...user, balance: newBalance, hasClaimedBonus: true });
    await addHistory(user.username, "bonus", "Welcome Bonus", config.bonusAmount, "Gift from Admin");
    return c.html(ProfilePage({ ...user, balance: newBalance, hasClaimedBonus: true }, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'success', text: `Welcome Bonus ${config.bonusAmount} Ks claimed!` }));
});

app.post("/profile/avatar", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    const body = await c.req.parseBody();
    const newAvatar = body.avatar as string;
    await updateUser({ ...user, avatar: newAvatar });
    return c.html(ProfilePage({ ...user, avatar: newAvatar }, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'success', text: 'Avatar Updated!' }));
});

app.post("/profile/password", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    const body = await c.req.parseBody();
    if (user.password !== body.oldPassword) { return c.html(ProfilePage(user, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'error', text: 'Incorrect Old Password' })); }
    await updateUser({ ...user, password: body.newPassword as string });
    return c.html(ProfilePage({ ...user, password: body.newPassword as string }, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'success', text: 'Password Changed Successfully!' }));
});

app.post("/redeem", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    const body = await c.req.parseBody();
    const code = (body.code as string).trim().toUpperCase();
    const voucher = await getVoucher(code);
    if (!voucher || voucher.isUsed) { return c.html(ProfilePage(user, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'error', text: 'Invalid or Used Voucher' })); }
    const res = await kv.atomic().check(await kv.get(["vouchers", code])).check(await kv.get(["users", user.username])).set(["vouchers", code], { ...voucher, isUsed: true, usedBy: user.username }).set(["users", user.username], { ...user, balance: user.balance + voucher.amount }).commit();
    if (!res.ok) return c.html(ProfilePage(user, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'error', text: 'Redemption Failed' }));
    await addHistory(user.username, "voucher", "Voucher Redeemed", voucher.amount, `Code: ${code}`);
    return c.html(ProfilePage({ ...user, balance: user.balance + voucher.amount }, { active: config.bonusActive, amount: config.bonusAmount }, { type: 'success', text: `Successfully added ${voucher.amount} Ks!` }));
});

app.post("/buy", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ success: false, message: "Unauthorized" }, 401);
  if (user.isBlocked) return c.json({ success: false, message: "Your account is blocked." });
  const config = await getConfig();
  if (config.maintenance && !user.isAdmin) return c.json({ success: false, message: "Maintenance Mode" });
  const body = await c.req.json(); 
  const id = body.id;
  const product = await getProduct(id as string);
  if (!product) return c.json({ success: false, message: "Product not found" });
  if (user.balance < product.price) return c.json({ success: false, message: "Insufficient Balance" });
  let finalDisplayCode = "";
  let soldKeyIdentifier = null; 
  if (product.type === "manual") {
    if (!product.stock.length) return c.json({ success: false, message: "Out of Stock" });
    finalDisplayCode = product.stock[0];
    const res = await kv.atomic().check(await kv.get(["products", product.id])).check(await kv.get(["users", user.username])).set(["products", product.id], { ...product, stock: product.stock.slice(1) }).set(["users", user.username], { ...user, balance: user.balance - product.price }).commit();
    if(!res.ok) return c.json({ success: false, message: "Transaction Failed. Try Again." });
  } else {
    try {
      const res = await fetch(product.apiUrl!);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
        const items = Array.isArray(json) ? json : [json];
        let validItem = null;
        for (const item of items) {
            const expDate = new Date(item.expiration_date);
            const now = new Date();
            now.setHours(0,0,0,0); 
            if (expDate < now) continue;
            if (item.android_id_1 && item.android_id_1.trim() !== "" && item.android_id_2 && item.android_id_2.trim() !== "") continue;
            if (await isKeySold(item.key)) continue;
            validItem = item;
            break;
        }
        if (!validItem) return c.json({ success: false, message: "Stock Unavailable from API" });
        finalDisplayCode = `Key: ${validItem.key}\nExpires: ${validItem.expiration_date}`;
        soldKeyIdentifier = validItem.key;
      } catch (e) { finalDisplayCode = text; }
      const resKv = await kv.atomic().check(await kv.get(["users", user.username])).set(["users", user.username], { ...user, balance: user.balance - product.price }).commit();
      if(!resKv.ok) throw new Error();
      if (soldKeyIdentifier) await markKeyAsSold(soldKeyIdentifier, user.username);
    } catch { return c.json({ success: false, message: "API Connection Error" }); }
  }
  const tx = await addHistory(user.username, "purchase", product.name, product.price, finalDisplayCode);
  if(tx) await addGlobalSale(user.username, tx);
  
  return c.json({ success: true, code: finalDisplayCode, newBalance: user.balance - product.price });
});

app.get("/deposit", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    if (config.maintenance && !user.isAdmin) return c.html(MaintenancePage());
    return c.html(Layout("Deposit", `<div class="max-w-xl mx-auto"><div class="glass rounded-2xl p-8 border border-blue-500/30"><h1 class="text-3xl font-bold text-white mb-2 text-center">💰 Top Up Balance</h1><p class="text-slate-400 text-center mb-8">ငွေဖြည့်ရန် အောက်ပါအကောင့်များသို့ ငွေလွှဲပါ။</p><div class="bg-slate-900/50 rounded-xl p-6 mb-8 border border-slate-700"><pre class="font-mono text-slate-200 whitespace-pre-wrap leading-loose text-center">${config.payment}</pre></div><div class="text-center"><p class="text-slate-400 text-sm mb-4">ငွေလွှဲပြီးပါက Admin ထံ Screenshot ပေးပို့ပါ။</p><a href="https://t.me/${config.telegram}" target="_blank" class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 px-8 rounded-full transition shadow-lg shadow-blue-500/30"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>Send Screenshot</a></div></div><div class="mt-6 text-center"><a href="/" class="text-slate-500 hover:text-white">Cancel</a></div></div>`, user));
});

app.get("/check-stock", async (c) => {
    const id = c.req.query("id"); if(!id) return c.text("?"); const p = await getProduct(id); if(!p || p.type !== 'api') return c.text("?"); const count = await getApiAvailableStock(p); return c.text(String(count));
});

app.get("/history", async (c) => {
  const user = await getSessionUser(c); 
  if (!user) return c.redirect("/login"); 
  
  // Use safe decode
  const cursor = c.req.query("cursor");
  const decodedCursor = cursor ? decodeCursor(cursor) : undefined;
  const filter = c.req.query("filter") || "all";

  const iter = kv.list<Transaction>({ prefix: ["history", user.username] }, { limit: 50, reverse: true, cursor: decodedCursor }); 
  const transactions: Transaction[] = [];
  let nextCursor = null;
  
  for await (const entry of iter) { 
      const t = entry.value;
      if (filter === 'purchase' && (t.type === 'purchase' || t.type === 'transfer_sent')) transactions.push(t); 
      else if (filter === 'topup' && (t.type === 'topup' || t.type === 'voucher' || t.type === 'bonus' || t.type === 'transfer_received' || t.type === 'refund')) transactions.push(t); 
      else if (filter === 'all') transactions.push(t); 
      nextCursor = entry.key; 
      if(transactions.length >= 10) break; 
  }
  
  // Use safe encode
  const encodedCursor = nextCursor ? encodeCursor(nextCursor) : null;
  return c.html(Layout("History", `<div class="max-w-4xl mx-auto"><h1 class="text-3xl font-bold text-white mb-6">Transaction History</h1>${HistoryTable(transactions, encodedCursor, filter)}<div class="mt-4 text-center text-slate-500 text-sm"><a href="/" class="hover:text-blue-400">← Back to Shop</a></div></div>`, user));
});

app.get("/login", (c) => c.html(Layout("Login", AuthForm("Login"))));
app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const user = await getUser(body.username as string);
  if (user && user.password === body.password) { 
      if(user.isBlocked) return c.html(Layout("Login", AuthForm("Login", "Your account has been blocked.")));
      const maxAge = body.remember === 'on' ? 60 * 60 * 24 * 15 : undefined;
      setCookie(c, "session_user", user.username, { maxAge }); 
      return c.redirect("/"); 
  } 
  return c.html(Layout("Login", AuthForm("Login", "Invalid username or password"))); 
});

app.get("/register", async (c) => { const config = await getConfig(); if (config.noReg) return c.html(Layout("Registration Closed", `<div class="text-center py-10 text-red-400 text-xl font-bold">⚠️ New registrations are currently disabled.</div>`)); return c.html(Layout("Register", AuthForm("Register"))); });
app.post("/register", async (c) => {
  const config = await getConfig();
  if (config.noReg) return c.html(Layout("Registration Closed", `<div class="text-center py-10 text-red-400 text-xl font-bold">⚠️ New registrations are currently disabled.</div>`));
  const { username, password } = await c.req.parseBody();
  const existing = await getUser(username as string);
  if (existing) return c.html(Layout("Register", AuthForm("Register", "Username already taken")));
  const list = kv.list({ prefix: ["users"] }, { limit: 1 });
  const isFirst = (await list.next()).done;
  const initialBalance = config.bonusActive ? config.bonusAmount : 0;
  await kv.set(["users", username as string], { username, password, balance: initialBalance, isAdmin: isFirst, hasClaimedBonus: config.bonusActive, createdAt: Date.now() } as User);
  if(initialBalance > 0) { await addHistory(username as string, "bonus", "Welcome Bonus", initialBalance, "Registration Gift"); }
  setCookie(c, "session_user", username as string);
  return c.redirect("/");
});
app.get("/logout", (c) => { deleteCookie(c, "session_user"); return c.redirect("/login"); });

app.get("/admin", async (c) => {
  try {
      const user = await getSessionUser(c);
      if (!user?.isAdmin) return c.redirect("/");
      
      const prodIter = kv.list<Product>({ prefix: ["products"] });
      let prodRows = "";
      for await (const { value: p } of prodIter) { const stockDisplay = p.type === 'manual' ? p.stock.length : 'Auto (API)'; prodRows += `<tr class="border-b border-slate-700 hover:bg-slate-800"><td class="p-3">${p.name}</td><td class="p-3">${p.price.toLocaleString()} Ks</td><td class="p-3">${stockDisplay}</td><td class="p-3 flex gap-2"><a href="/admin/edit?id=${p.id}" class="text-yellow-400 hover:underline">Edit</a><form action="/admin/delete" method="POST" onsubmit="return confirm('Are you sure?')" style="margin:0;"><input type="hidden" name="id" value="${p.id}"><button class="text-red-400 hover:underline">Delete</button></form></td></tr>`; }
      
      // Safe User Cursor
      const userCursor = c.req.query("user_cursor");
      const decodedUserCursor = userCursor ? decodeCursor(userCursor) : undefined;
      
      const userIter = kv.list<User>({ prefix: ["users"] }, { limit: 10, cursor: decodedUserCursor });
      let userListHtml = "";
      let nextUserCursor = null;
      for await (const { value: u, key } of userIter) {
          nextUserCursor = key; 
          if (u.username !== user.username) { 
              userListHtml += `<div class="flex justify-between items-center border-b border-slate-700 py-2 text-sm"><div><span class="text-slate-300 select-all cursor-pointer font-bold" onclick="document.querySelector('input[name=username]').value = '${u.username}'">${u.username}</span><span class="text-xs ml-2 ${u.isBlocked ? 'text-red-500' : 'text-green-500'}">${u.isBlocked ? '(Blocked)' : '(Active)'}</span></div><div class="flex items-center gap-2"><span class="text-green-400">${u.balance.toLocaleString()} Ks</span><form action="/admin/block" method="POST" style="margin:0"><input type="hidden" name="username" value="${u.username}"><input type="hidden" name="status" value="${u.isBlocked ? 'unblock' : 'block'}"><button class="text-xs px-2 py-1 rounded ${u.isBlocked ? 'bg-green-600' : 'bg-red-600'} text-white">${u.isBlocked ? 'Unblock' : 'Block'}</button></form></div></div>`; 
          } 
      }
      const encodedUserCursor = nextUserCursor ? encodeCursor(nextUserCursor) : null;

      // Safe Sale Cursor
      const saleCursor = c.req.query("sale_cursor");
      const decodedSaleCursor = saleCursor ? decodeCursor(saleCursor) : undefined;
      
      const saleIter = kv.list<GlobalSale>({ prefix: ["global_sales"] }, { limit: 10, reverse: true, cursor: decodedSaleCursor });
      const sales: GlobalSale[] = [];
      let nextSaleCursor = null;
      for await (const entry of saleIter) { sales.push(entry.value); nextSaleCursor = entry.key; }
      const encodedSaleCursor = nextSaleCursor ? encodeCursor(nextSaleCursor) : null;

      const config = await getConfig();

      return c.html(Layout("Admin", `
        <div class="grid lg:grid-cols-3 gap-8">
          <div class="lg:col-span-1 space-y-6">
            <div class="glass p-6 rounded-xl border-l-4 border-yellow-500 space-y-4">
                <h3 class="text-xl font-bold text-white">⚙️ Configuration</h3>
                <form action="/admin/config" method="POST" class="space-y-3">
                    <div class="grid grid-cols-2 gap-2">
                        <label class="flex items-center space-x-2 cursor-pointer bg-slate-800 p-2 rounded border ${config.maintenance ? 'border-red-500' : 'border-slate-600'}"><input type="checkbox" name="maintenance" ${config.maintenance ? 'checked' : ''}><span class="text-xs text-white">Maintenance</span></label>
                        <label class="flex items-center space-x-2 cursor-pointer bg-slate-800 p-2 rounded border ${config.noReg ? 'border-red-500' : 'border-slate-600'}"><input type="checkbox" name="noReg" ${config.noReg ? 'checked' : ''}><span class="text-xs text-white">No Register</span></label>
                    </div>
                    <div class="bg-slate-900/50 p-3 rounded border border-slate-600"><label class="flex items-center space-x-2 cursor-pointer mb-2"><input type="checkbox" name="bonusActive" ${config.bonusActive ? 'checked' : ''}><span class="text-xs text-green-400 font-bold uppercase">Welcome Bonus Active</span></label><input name="bonusAmount" type="number" value="${config.bonusAmount}" placeholder="Bonus Amount (Ks)" class="w-full bg-slate-800 border border-slate-600 rounded p-1 text-white text-sm"></div>
                    <div><label class="text-xs text-slate-400 uppercase">Announcement</label><input name="banner" value="${config.banner}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"></div>
                    <div><label class="text-xs text-slate-400 uppercase">Telegram</label><input name="telegram" value="${config.telegram}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"></div>
                    <div><label class="text-xs text-slate-400 uppercase">Payment Details</label><textarea name="payment" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm h-20">${config.payment}</textarea></div>
                    <button class="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded font-bold w-full">Update Settings</button>
                </form>
            </div>
            <div class="glass p-6 rounded-xl border-l-4 border-purple-500"><h3 class="text-xl font-bold text-white mb-4">🎟️ Create Voucher</h3><form action="/admin/voucher" method="POST" class="space-y-3"><input name="code" placeholder="Voucher Code (e.g. HAPPY)" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white uppercase"><div class="flex gap-2"><input name="amount" type="number" placeholder="Amount" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><button class="bg-purple-600 px-4 rounded text-white font-bold">Create</button></div></form></div>
            <div class="glass p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-4">💰 User Top Up</h3><form action="/admin/topup" method="POST" class="space-y-3"><input name="username" placeholder="Username" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><div class="flex gap-2"><input name="amount" type="number" placeholder="Amount" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><button class="bg-blue-600 px-4 rounded text-white font-bold">Add</button></div></form></div>
            <div class="glass p-6 rounded-xl">
                <h3 class="text-lg font-bold text-white mb-2">👥 Users</h3>
                ${AdminUserTable(userListHtml, encodedUserCursor)}
            </div>
          </div>
          <div class="lg:col-span-2 space-y-8">
            <div class="glass p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-4">➕ Add Product</h3><form action="/admin/add" method="POST" class="space-y-3"><div class="grid grid-cols-2 gap-4"><input name="name" placeholder="Name" required class="bg-slate-800 border border-slate-600 rounded p-2 text-white"><input name="price" type="number" placeholder="Price" required class="bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><input name="desc" placeholder="Description" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><select name="type" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><option value="manual">Manual Stock</option><option value="api">API Link</option></select><input name="imageUrl" placeholder="Image URL (Optional)" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><textarea name="data" placeholder="Codes (Manual) or URL (API)" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-20"></textarea><button class="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">Add Product</button></form></div>
            <div class="glass p-6 rounded-xl overflow-x-auto"><h3 class="text-xl font-bold text-white mb-4">📦 Inventory</h3><table class="w-full text-left text-slate-300 text-sm"><thead class="bg-slate-700 text-white uppercase"><tr><th class="p-3">Name</th><th class="p-3">Price</th><th class="p-3">Stock</th><th class="p-3">Actions</th></tr></thead><tbody>${prodRows}</tbody></table></div>
            ${AdminSalesTable(sales, encodedSaleCursor)}
          </div>
        </div>
      `, user));
  } catch (e) {
      return c.html(Layout("Admin Error", `
        <div class="max-w-md mx-auto glass p-8 rounded-xl text-center mt-10">
            <h1 class="text-2xl font-bold text-red-400 mb-4">Admin Panel Error</h1>
            <pre class="text-left bg-slate-900 p-4 rounded text-xs text-slate-400 overflow-x-auto mb-4">${e}</pre>
            <a href="/" class="bg-slate-700 text-white px-6 py-2 rounded hover:bg-slate-600">Back Home</a>
        </div>
      `, await getSessionUser(c)));
  }
});

app.post("/admin/refund", async (c) => {
    const user = await getSessionUser(c);
    if (!user?.isAdmin) return c.redirect("/");
    const body = await c.req.parseBody();
    await processRefund(body.username as string, Number(body.date), body.id as string);
    return c.redirect("/admin");
});

app.post("/admin/block", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const targetUsername = body.username as string; const shouldBlock = body.status === 'block'; const targetUser = await getUser(targetUsername); if(targetUser) { await updateUser({ ...targetUser, isBlocked: shouldBlock }); } return c.redirect("/admin"); });
app.post("/admin/config", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); await setConfig("banner", body.banner as string); await setConfig("telegram", body.telegram as string); await setConfig("payment", body.payment as string); await setConfig("maintenance", body.maintenance === "on"); await setConfig("no_reg", body.noReg === "on"); await setConfig("bonus_active", body.bonusActive === "on"); await setConfig("bonus_amount", Number(body.bonusAmount)); return c.redirect("/admin"); });
app.post("/admin/voucher", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const code = (body.code as string).trim().toUpperCase(); const amount = Number(body.amount); await createVoucher(code, amount); return c.redirect("/admin"); });
app.post("/admin/topup", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const targetUsername = (body.username as string).trim(); const amount = Number(body.amount); const targetUser = await getUser(targetUsername); if (!targetUser) return c.html(Layout("Admin Error", "User Not Found", user)); await kv.set(["users", targetUsername], { ...targetUser, balance: targetUser.balance + amount }); await addHistory(targetUsername, "topup", "Admin Topup", amount, `Added by Admin`); return c.redirect("/admin"); });
app.post("/admin/add", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const p: Product = { id: crypto.randomUUID(), name: body.name as string, description: body.desc as string, price: Number(body.price), type: body.type as any, stock: body.type === 'manual' ? (body.data as string).split("\n").map(s=>s.trim()).filter(Boolean) : [], apiUrl: body.type === 'api' ? (body.data as string).trim() : undefined, imageUrl: body.imageUrl as string }; await kv.set(["products", p.id], p); return c.redirect("/admin"); });
app.post("/admin/delete", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const { id } = await c.req.parseBody(); await kv.delete(["products", id as string]); return c.redirect("/admin"); });
app.get("/admin/edit", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const id = c.req.query("id"); const p = await getProduct(id!); if (!p) return c.redirect("/admin"); return c.html(Layout("Edit", `<div class="max-w-lg mx-auto glass p-8 rounded-xl"><h2 class="text-2xl font-bold text-white mb-6">Edit Product</h2><form action="/admin/update" method="POST" class="space-y-4"><input type="hidden" name="id" value="${p.id}"><div><label class="text-slate-400 block mb-1">Name</label><input name="name" value="${p.name}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Price</label><input name="price" type="number" value="${p.price}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Description</label><input name="desc" value="${p.description}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Image URL</label><input name="imageUrl" value="${p.imageUrl || ''}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Data</label><textarea name="data" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-32">${p.type === 'manual' ? p.stock.join("\n") : p.apiUrl}</textarea></div><div class="flex gap-4 pt-4"><button class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded">Update</button><a href="/admin" class="flex-1 bg-slate-700 text-center py-2 rounded text-white">Cancel</a></div></form></div>`, user)); });
app.post("/admin/update", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const p = await getProduct(body.id as string); if (p) { const updated: Product = { ...p, name: body.name as string, price: Number(body.price), description: body.desc as string, stock: p.type === 'manual' ? (body.data as string).split("\n").map(s=>s.trim()).filter(Boolean) : [], apiUrl: p.type === 'api' ? (body.data as string).trim() : undefined, imageUrl: body.imageUrl as string }; await kv.set(["products", p.id], updated); } return c.redirect("/admin"); });

Deno.serve(app.fetch);
