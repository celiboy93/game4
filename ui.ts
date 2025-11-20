import { User, Product, Transaction } from "./db.ts";

export const Layout = (title: string, content: string, user?: User, bannerText?: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    // --- Copy Function ---
    function copyToClipboard(text, btnId = 'copyBtn') {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById(btnId);
            if(btn) {
                const originalText = btn.innerText; // Use innerText to store original
                btn.innerText = '✅ Copied!';
                btn.classList.remove('bg-blue-600');
                btn.classList.add('bg-green-600');
                setTimeout(() => {
                    btn.innerText = "Copy Code"; // Reset text
                    btn.classList.remove('bg-green-600');
                    btn.classList.add('bg-blue-600');
                }, 2000);
            }
        });
    }

    // New: Helper to copy from the displayed box directly (Fixes the quote escaping error)
    function copyPurchasedCode() {
        const codeText = document.getElementById('purchasedCode').innerText;
        copyToClipboard(codeText, 'copyBtnModal');
    }

    // --- Search Function ---
    function filterProducts() {
        const input = document.getElementById('searchInput');
        const filter = input.value.toLowerCase();
        const nodes = document.querySelectorAll('.product-card');
        nodes.forEach(node => {
            const name = node.dataset.name.toLowerCase();
            node.style.display = name.includes(filter) ? "flex" : "none";
        });
    }

    // --- Lazy Load Stock ---
    document.addEventListener("DOMContentLoaded", () => {
        const apiProducts = document.querySelectorAll(".api-stock-loader");
        apiProducts.forEach(async (el) => {
            const id = el.dataset.id;
            try {
                const res = await fetch("/check-stock?id=" + id);
                const text = await res.text();
                el.innerText = text;
                if(text.includes("0") || text === "?") {
                   disableProductCard(id);
                }
            } catch { el.innerText = "?"; }
        });
    });

    function disableProductCard(id) {
        const btn = document.getElementById("btn-" + id);
        const badge = document.getElementById("badge-" + id);
        if(btn) {
           btn.disabled = true;
           btn.classList.remove("bg-blue-600", "hover:bg-blue-500");
           btn.classList.add("bg-slate-700", "cursor-not-allowed");
           btn.innerText = "🚫 Out of Stock";
           btn.removeAttribute("onclick");
        }
        if(badge) {
           badge.classList.remove("bg-green-500/20", "text-green-400");
           badge.classList.add("bg-red-500/20", "text-red-400");
        }
    }

    // --- Modal Logic ---
    let selectedProductId = null;

    function confirmBuy(id, name, price) {
        selectedProductId = id;
        document.getElementById('confirmName').innerText = name;
        document.getElementById('confirmPrice').innerText = price + " Ks";
        document.getElementById('confirmModal').classList.remove('hidden');
    }

    function closeConfirmModal() {
        document.getElementById('confirmModal').classList.add('hidden');
        selectedProductId = null;
    }

    function closeSuccessModal() {
        document.getElementById('successModal').classList.add('hidden');
    }

    async function processPurchase() {
        if(!selectedProductId) return;
        
        const confirmBtn = document.getElementById('confirmBtnAction');
        const originalText = confirmBtn.innerText;
        confirmBtn.innerText = "Processing...";
        confirmBtn.disabled = true;

        try {
            const res = await fetch("/buy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: selectedProductId })
            });
            
            const data = await res.json();
            closeConfirmModal();

            if(data.success) {
                // 1. Set the code text
                document.getElementById('purchasedCode').innerText = data.code;
                
                // 2. Show the modal (No need to mess with onclick attributes anymore)
                document.getElementById('successModal').classList.remove('hidden');
                
                // 3. Update Balance UI
                const balanceEl = document.getElementById('navBalance');
                if(balanceEl) balanceEl.innerText = data.newBalance.toLocaleString() + " Ks";
                const mobileBalanceEl = document.getElementById('mobileNavBalance');
                if(mobileBalanceEl) mobileBalanceEl.innerText = data.newBalance.toLocaleString() + " Ks";

            } else {
                alert(data.message || "Purchase Failed");
            }
        } catch (e) {
            alert("Connection Error");
        } finally {
            confirmBtn.innerText = originalText;
            confirmBtn.disabled = false;
        }
    }
  </script>
  <style>
    body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }
    .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
    .modal-backdrop { background-color: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px); }
    .code-box { background-image: radial-gradient(#334155 1px, transparent 1px); background-size: 10px 10px; }
    .marquee-container { overflow: hidden; white-space: nowrap; position: relative; }
    .marquee-content { display: inline-block; animation: marquee 15s linear infinite; padding-left: 100%; }
    @keyframes marquee { 0% { transform: translate(0, 0); } 100% { transform: translate(-100%, 0); } }
  </style>
</head>
<body class="min-h-screen flex flex-col relative">
  <nav class="glass sticky top-0 z-40 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
      <a href="/" class="text-2xl font-bold text-blue-500 hover:text-blue-400 transition">🎮 GameStore</a>
      <div class="flex gap-4 items-center">
        ${user ? `
          <a href="/deposit" class="hidden md:flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full transition border border-slate-600">
             <span class="text-sm text-slate-400">Balance:</span>
             <span id="navBalance" class="text-green-400 font-bold">${user.balance.toLocaleString()} Ks</span>
             <span class="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">+</span>
          </a>
          <a href="/history" class="text-slate-300 hover:text-white font-medium">History</a>
          ${user.isAdmin ? '<a href="/admin" class="text-yellow-400 hover:text-yellow-300 font-semibold">Admin</a>' : ''}
          <a href="/logout" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition">Logout</a>
        ` : `
          <a href="/login" class="text-slate-300 hover:text-white">Login</a>
          <a href="/register" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">Register</a>
        `}
      </div>
    </div>
    ${user ? `<div class="md:hidden px-4 pb-2 text-center border-t border-slate-700 pt-2">
        <a href="/deposit" class="inline-flex items-center gap-2 text-slate-400">
            Balance: <span id="mobileNavBalance" class="text-green-400 font-bold">${user.balance.toLocaleString()} Ks</span>
            <span class="bg-green-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">+</span>
        </a>
    </div>` : ''}
  </nav>

  ${bannerText ? `<div class="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-200 py-2"><div class="marquee-container max-w-7xl mx-auto"><div class="marquee-content font-medium tracking-wide">📢 ${bannerText}</div></div></div>` : ''}

  <main class="flex-grow container mx-auto px-4 py-8">
    ${content}
  </main>

  <div id="confirmModal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4">
    <div class="bg-[#1e293b] border border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl transform transition-all scale-100">
        <h3 class="text-xl font-bold text-white mb-2">Confirm Purchase?</h3>
        <p class="text-slate-400 mb-4">Are you sure you want to buy <br><span id="confirmName" class="text-blue-400 font-bold"></span> for <span id="confirmPrice" class="text-green-400 font-bold"></span>?</p>
        <div class="flex gap-3">
            <button onclick="closeConfirmModal()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition">Cancel</button>
            <button id="confirmBtnAction" onclick="processPurchase()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition shadow-lg shadow-blue-500/20">Yes, Buy</button>
        </div>
    </div>
  </div>

  <div id="successModal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4">
    <div class="bg-[#1e293b] border border-green-500/30 rounded-2xl p-0 max-w-md w-full shadow-2xl overflow-hidden">
        <div class="bg-green-600/20 p-6 text-center border-b border-green-500/20">
            <div class="text-5xl mb-2">🎉</div>
            <h2 class="text-2xl font-bold text-green-400">Successful!</h2>
        </div>
        <div class="p-6">
            <p class="text-slate-400 text-sm mb-2 uppercase tracking-wider font-semibold text-center">Your Code:</p>
            <div class="code-box bg-slate-900 border-2 border-dashed border-slate-600 rounded-xl p-4 mb-6 relative">
                 <pre id="purchasedCode" class="font-mono text-green-400 whitespace-pre-wrap break-all text-base leading-relaxed text-center"></pre>
            </div>
            <div class="flex flex-col gap-3">
                <button id="copyBtnModal" onclick="copyPurchasedCode()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg">Copy Code</button>
                <button onclick="closeSuccessModal()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl transition">Close</button>
            </div>
        </div>
    </div>
  </div>

  <footer class="text-center text-slate-600 py-6 text-sm">
    &copy; 2025 Digital Shop System
  </footer>
</body>
</html>
`;

// (Rest of the file is the same, but including here to be complete for copy-paste)
export const AuthForm = (type: "Login" | "Register", error?: string) => `
<div class="max-w-md mx-auto glass p-8 rounded-2xl shadow-2xl">
  <h2 class="text-3xl font-bold text-center mb-6 text-white">${type}</h2>
  ${error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded mb-4 text-center">${error}</div>` : ''}
  <form method="POST" class="space-y-4">
    <div><label class="block text-sm font-medium text-slate-400 mb-1">Username</label><input type="text" name="username" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>
    <div><label class="block text-sm font-medium text-slate-400 mb-1">Password</label><input type="password" name="password" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>
    <button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">${type}</button>
  </form>
  <p class="mt-4 text-center text-slate-400 text-sm">
    ${type === 'Login' ? 'Don\'t have an account? <a href="/register" class="text-blue-400">Register</a>' : 'Already have an account? <a href="/login" class="text-blue-400">Login</a>'}
  </p>
</div>
`;

export const MaintenancePage = () => `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }</style></head><body class="h-screen flex flex-col items-center justify-center p-4 text-center"><div class="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full"><div class="text-6xl mb-4">🚧</div><h1 class="text-3xl font-bold text-white mb-2">Under Maintenance</h1><p class="text-slate-400 mb-6">We are currently updating our server. Please check back later.</p><a href="/login" class="text-sm text-slate-600 hover:text-slate-400">Admin Login</a></div></body></html>
`;

export const ProductCard = (p: Product) => {
  const isManual = p.type === 'manual';
  const manualStock = p.stock ? p.stock.length : 0;
  const stockDisplay = isManual ? `Stock: ${manualStock}` : `Stock: <span class="api-stock-loader animate-pulse" data-id="${p.id}">...</span>`;
  const isDisabled = isManual && manualStock === 0;

  return `
  <div class="product-card glass rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 transition transform hover:-translate-y-1 duration-300 flex flex-col h-full" data-name="${p.name}">
    <div class="p-5 flex-grow">
      <div class="flex justify-between items-start mb-2">
        <h3 class="text-xl font-bold text-white truncate">${p.name}</h3>
        <span id="badge-${p.id}" class="text-xs px-2 py-1 rounded ${!isDisabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${stockDisplay}</span>
      </div>
      <p class="text-slate-400 text-sm mb-4 line-clamp-2">${p.description}</p>
      <div class="text-2xl font-bold text-blue-400">${p.price.toLocaleString()} Ks</div>
    </div>
    <div class="p-5 pt-0 mt-auto">
        <button id="btn-${p.id}" 
            ${isDisabled ? 'disabled' : `onclick="confirmBuy('${p.id}', '${p.name}', '${p.price.toLocaleString()}')"`} 
            class="w-full ${!isDisabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 cursor-not-allowed'} text-white font-bold py-2 rounded-lg transition flex justify-center items-center gap-2">
          ${isDisabled ? '🚫 Out of Stock' : '⚡ Buy Now'}
        </button>
    </div>
  </div>
  `;
};

export const HistoryTable = (transactions: Transaction[], nextCursor: string | null) => {
    let rows = "";
    if (transactions.length === 0) {
        rows = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No transaction history found.</td></tr>`;
    } else {
        rows = transactions.map(t => `
            <tr class="border-b border-slate-700 hover:bg-slate-800/50 transition">
                <td class="p-4 text-sm text-slate-400">${new Date(t.date).toLocaleString()}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${t.type === 'purchase' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}">${t.type.toUpperCase()}</span></td>
                <td class="p-4 font-medium text-white">${t.itemName} ${t.type === 'purchase' ? `<div class="text-xs text-slate-500 mt-1 font-mono truncate w-32 md:w-64">${t.detail.substring(0, 30)}...</div>` : ''}</td>
                <td class="p-4 text-right ${t.type === 'purchase' ? 'text-red-400' : 'text-green-400'} font-bold">${t.type === 'purchase' ? '-' : '+'}${t.amount.toLocaleString()} Ks</td>
            </tr>
        `).join("");
    }
    return `<div class="glass rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-4">Date</th><th class="p-4">Type</th><th class="p-4">Description</th><th class="p-4 text-right">Amount</th></tr></thead><tbody class="divide-y divide-slate-700">${rows}</tbody></table></div>${nextCursor ? `<div class="p-4 text-center border-t border-slate-700"><a href="/history?cursor=${nextCursor}" class="inline-block bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded transition">Load Next 10 Entries</a></div>` : ''}</div>`;
};
