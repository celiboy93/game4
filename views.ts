// views.ts
import { User, Product, formatCurrency, formatTime } from "./shared.ts";
import * as DB from "./db.ts";

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" };

const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
    body { font-family: 'Roboto', sans-serif; margin: 0; padding: 20px; background-color: #f0f2f5; min-height: 90vh; font-size: 16px; display:flex; justify-content:center; align-items:center;}
    .container { max-width: 600px; width: 100%; padding: 25px; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    h1, h2 { text-align: center; color: #333; } a { color: #007bff; text-decoration: none; }
    button { background: #007bff; color: white; border: none; padding: 12px; border-radius: 8px; width: 100%; font-weight: bold; font-size: 16px; cursor: pointer; margin-top:10px;}
    input, textarea { width: 95%; padding: 12px; margin: 5px 0; border: 1px solid #ddd; border-radius: 8px; }
    .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
    .success { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-top:20px;}
    .product-card { border: 1px solid #eee; padding: 10px; border-radius: 8px; text-align: center; display:flex; flex-direction:column;}
    .product-image { width: 100%; height: 100px; object-fit: cover; border-radius: 5px; }
    .nav { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .nav a { padding: 8px 15px; background: #eee; border-radius: 5px; }
`;

export function renderLoginForm(req: Request): Response {
    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalStyles}</style></head><body><div class="container">
        <h1>Login</h1>
        ${error ? `<div class="error">${error === 'invalid' ? 'Invalid Credentials' : 'Account Blocked'}</div>` : ''}
        <form action="/auth" method="POST">
            <label>Username:</label><input type="text" name="username" required>
            <label>Password:</label><input type="password" name="password" required>
            <label><input type="checkbox" name="remember" style="width:auto;"> Remember Me</label>
            <button type="submit">Login</button>
        </form>
        <p style="text-align:center"><a href="/register">Create Account</a></p>
    </div></body></html>`;
    return new Response(html, { headers: HTML_HEADERS });
}

export function renderRegisterForm(req: Request): Response {
    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalStyles}</style></head><body><div class="container">
        <h1>Register</h1>
        ${error ? `<div class="error">Username already taken.</div>` : ''}
        <form action="/doregister" method="POST">
            <label>Username:</label><input type="text" name="username" required>
            <label>Password:</label><input type="password" name="password" required>
            <button type="submit" style="background:#28a745">Register</button>
        </form>
        <p style="text-align:center"><a href="/login">Back to Login</a></p>
    </div></body></html>`;
    return new Response(html, { headers: HTML_HEADERS });
}

export function renderMessagePage(title: string, message: string, isError = false): Response {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="2;url=/dashboard"><style>${globalStyles}</style></head><body><div class="container">
        <h1 style="color:${isError?'#dc3545':'#28a745'}">${title}</h1><p style="text-align:center;font-size:1.2em;">${message}</p>
        <p style="text-align:center"><a href="/dashboard">Back to Shop</a></p>
    </div></body></html>`;
    return new Response(html, { headers: HTML_HEADERS });
}

export async function handleDashboard(req: Request, user: User): Promise<Response> {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") || 'All';
    const allProducts = await DB.getProducts();
    const categories = ['All', ...Array.from(new Set(allProducts.map(p => p.category)))];
    const products = category === 'All' ? allProducts : allProducts.filter(p => p.category === category);
    const announcement = await DB.getAnnouncement();

    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalStyles}
    .cat-link { margin: 2px; display:inline-block; font-size:0.9em; } .cat-link.active { background:#007bff; color:white; }
    </style></head><body><div class="container" style="max-width:800px">
        <div class="nav"><a href="/user-info">My Profile</a><a href="/logout" style="color:red">Logout</a></div>
        ${announcement ? `<div style="background:#fff3cd;padding:10px;border-radius:5px;margin-bottom:15px;text-align:center;">📢 ${announcement}</div>` : ''}
        <div style="background:#007bff;color:white;padding:20px;border-radius:10px;text-align:center;margin-bottom:20px;">
            <div>Welcome, <b>${user.username}</b> (${user.tier})</div>
            <div style="font-size:2em;font-weight:bold;">${formatCurrency(user.balance)} Ks</div>
        </div>
        <div style="text-align:center;margin-bottom:15px;">
            ${categories.map(c => `<a href="/dashboard?category=${c}" class="cat-link ${c===category?'active':''}">${c}</a>`).join('')}
        </div>
        <div class="product-grid">
            ${products.map(p => `
                <div class="product-card">
                    ${p.imageUrl.startsWith('http') ? `<img src="${p.imageUrl}" class="product-image">` : `<div style="font-size:50px">${p.imageUrl}</div>`}
                    <h3>${p.name}</h3>
                    <div style="color:#28a745;font-weight:bold;">${formatCurrency(p.salePrice || p.price)} Ks</div>
                    <form action="/buy" method="POST" style="margin-top:auto">
                        <input type="hidden" name="productId" value="${p.id}">
                        <button type="submit" onclick="return confirm('Buy ${p.name}?')">Buy Now</button>
                    </form>
                </div>
            `).join('')}
        </div>
    </div></body></html>`;
    return new Response(html, { headers: HTML_HEADERS });
}

export async function handleUserInfoPage(req: Request, user: User): Promise<Response> {
    const url = new URL(req.url);
    const msg = url.searchParams.get("message");
    const err = url.searchParams.get("error");
    const { transactions } = await DB.getTransactions(user.username, 20);
    const payment = await DB.getPaymentInfo();

    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalStyles} .hist-item{border-bottom:1px solid #eee;padding:8px;display:flex;justify-content:space-between;font-size:0.9em;}</style></head><body><div class="container">
        <div class="nav"><a href="/dashboard">Back to Shop</a><a href="/logout">Logout</a></div>
        <h1>My Profile</h1>
        ${msg ? `<div class="success">${msg}</div>` : ''} ${err ? `<div class="error">${err}</div>` : ''}
        
        <h3>Transfer Balance</h3>
        <form action="/transfer_funds" method="POST" style="background:#f9f9f9;padding:15px;border-radius:8px;">
            <input type="text" name="recipient_name" placeholder="Recipient Username" required>
            <input type="number" name="transfer_amount" placeholder="Amount (Ks)" required>
            <button type="submit" style="background:#fd7e14">Transfer</button>
        </form>

        <h3>Redeem Voucher</h3>
        <form action="/redeem_voucher" method="POST" style="display:flex;gap:5px;">
            <input type="text" name="code" placeholder="Code" required>
            <button type="submit">Redeem</button>
        </form>
        
        ${payment ? `<div style="margin-top:20px;padding:15px;background:#e2e3e5;border-radius:8px;">
            <b>Payment Info:</b><br>${payment.instructions}<br>
            KPay: ${payment.kpayNumber} (${payment.kpayName})<br>Wave: ${payment.waveNumber}
        </div>` : ''}

        <h3>History</h3>
        <div style="max-height:300px;overflow-y:auto;border:1px solid #eee;">
            ${transactions.map(t => `
                <div class="hist-item">
                    <div>
                        <div>${t.itemName || t.type} ${t.isRolledBack?'(REFUNDED)':''}</div>
                        <div style="color:#777;font-size:0.8em">${t.itemDetails || t.timestamp}</div>
                    </div>
                    <div style="color:${t.type==='topup'?'green':'red'}">${t.type==='topup'?'+':'-'}${formatCurrency(Math.abs(t.amount))}</div>
                </div>`).join('')}
        </div>
    </div></body></html>`;
    return new Response(html, { headers: HTML_HEADERS });
}

export async function renderAdminPanel(token: string, message: string | null): Promise<Response> {
    const products = await DB.getProducts();
    const vouchers = await DB.getUnusedVouchers();
    const summary = await DB.getSalesSummary();
    
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalStyles} details{margin-bottom:10px;border:1px solid #ddd;padding:10px;border-radius:5px;}</style></head><body><div class="container" style="max-width:800px">
        <h1>Admin Panel</h1>
        ${message ? `<div class="success">${message}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;text-align:center;">
            <div style="background:#eee;padding:10px;border-radius:5px;">Users: <b>${summary.totalUsers}</b></div>
            <div style="background:#eee;padding:10px;border-radius:5px;">Sales: <b>${formatCurrency(summary.totalSales)} Ks</b></div>
        </div>

        <details><summary>Add Product</summary>
            <form action="/admin/add_product" method="POST">
                <input type="hidden" name="token" value="${token}">
                <input type="text" name="name" placeholder="Name" required>
                <input type="text" name="category" placeholder="Category" required>
                <input type="number" name="price" placeholder="Price" required>
                <input type="url" name="imageUrl" placeholder="Image URL/Emoji" required>
                <label><input type="checkbox" name="isDigital"> Digital Code?</label>
                <textarea name="stock" placeholder="Stock (one per line)"></textarea>
                <button type="submit">Add</button>
            </form>
        </details>

        <details><summary>User Management</summary>
            <form action="/admin/adjust_balance" method="POST">
                <input type="hidden" name="token" value="${token}">
                <input type="text" name="name" placeholder="Username" required>
                <input type="number" name="amount" placeholder="Amount (+/-)" required>
                <button type="submit">Adjust Balance</button>
            </form>
            <form action="/admin/toggle_block" method="POST" style="margin-top:10px">
                <input type="hidden" name="token" value="${token}">
                <input type="text" name="name" placeholder="Username" required>
                <button type="submit" style="background:#6c757d">Block/Unblock</button>
            </form>
        </details>
        
        <details><summary>Vouchers</summary>
            <form action="/admin/create_voucher" method="POST">
                <input type="hidden" name="token" value="${token}">
                <input type="number" name="amount" placeholder="Amount" required>
                <button type="submit">Create</button>
            </form>
            <div style="max-height:150px;overflow-y:auto;margin-top:10px;">
                ${vouchers.map(v => `<div>${v.code} - ${v.value}Ks</div>`).join('')}
            </div>
        </details>

        <h3>Products</h3>
        <div style="max-height:300px;overflow-y:auto;">
            ${products.map(p => `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:5px;">
                    <span>${p.name} (${p.stock.length})</span>
                    <form action="/admin/delete_product" method="POST" style="display:inline;">
                        <input type="hidden" name="token" value="${token}">
                        <input type="hidden" name="productId" value="${p.id}">
                        <button type="submit" style="background:red;padding:5px;width:auto;margin:0;">X</button>
                    </form>
                </div>`).join('')}
        </div>
    </div></body></html>`;
    return new Response(html, { headers: HTML_HEADERS });
}
