import { User, Product, Transaction } from "./db.ts";

const AVATARS = ["😎", "👾", "🤖", "👻", "👽", "🐯", "🐼", "🦊", "🦁", "🐷", "🐸", "💀"];

export const Layout = (title: string, content: string, user?: User, bannerText?: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    // --- Wait for Page Load to finish ---
    window.addEventListener('load', () => {
        const loader = document.getElementById('page-loader');
        // Fade out effect
        loader.classList.add('opacity-0');
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 300);
    });

    // --- Show Loader on Navigation ---
    document.addEventListener("DOMContentLoaded", () => {
        const loader = document.getElementById('page-loader');
        
        // 1. API Stock Lazy Load
        const apiProducts = document.querySelectorAll(".api-stock-loader");
        apiProducts.forEach(async (el) => {
            const id = el.dataset.id;
            try {
                const res = await fetch("/check-stock?id=" + id);
                const text = await res.text();
                el.innerText = text;
                if(text.includes("0") || text === "?") { disableProductCard(id); }
            } catch { el.innerText = "?"; }
        });

        // 2. Link Clicks
        document.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                // Don't show loader for external links or anchor tags
                if (href && !href.startsWith('#') && !href.startsWith('javascript') && !e.ctrlKey && !e.metaKey && !href.startsWith('http')) {
                    loader.classList.remove('hidden');
                    loader.classList.remove('opacity-0');
                }
            });
        });

        // 3. Form Submits
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', () => {
                if(!form.closest('.modal-content')) { 
                    loader.classList.remove('hidden');
                    loader.classList.remove('opacity-0');
                }
            });
        });
    });

    // Back Button Fix (bfcache)
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) { 
            const loader = document.getElementById('page-loader');
            loader.classList.add('hidden'); 
        }
    });

    function copyToClipboard(text, btnId = 'copyBtn') {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById(btnId);
            if(btn) {
                const originalText = btn.innerText; 
                btn.innerText = '✅ Copied!';
                btn.classList.remove('bg-blue-600');
                btn.classList.add('bg-green-600');
                setTimeout(() => {
                    btn.innerText = "Copy Code"; 
                    btn.classList.remove('bg-green-600');
                    btn.classList.add('bg-blue-600');
                }, 2000);
            }
        });
    }

    function copyPurchasedCode() {
        const codeText = document.getElementById('purchasedCode').innerText;
        copyToClipboard(codeText, 'copyBtnModal');
    }

    function filterProducts() {
        const input = document.getElementById('searchInput');
        const filter = input.value.toLowerCase();
        const nodes = document.querySelectorAll('.product-card');
        nodes.forEach(node => {
            const name = node.dataset.name.toLowerCase();
            node.style.display = name.includes(filter) ? "flex" : "none";
        });
    }

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

    let selectedProductId = null;
    function confirmBuy(id, name, price) {
        selectedProductId = id;
        document.getElementById('confirmName').innerText = name;
        document.getElementById('confirmPrice').innerText = price + " Ks";
        document.getElementById('confirmModal').classList.remove('hidden');
    }
    function closeConfirmModal() { document.getElementById('confirmModal').classList.add('hidden'); selectedProductId = null; }
    function closeSuccessModal() { document.getElementById('successModal').classList.add('hidden'); }
    function closeErrorModal() { document.getElementById('errorModal').classList.add('hidden'); }

    function showErrorModal(msg, isBalanceError = false) {
        document.getElementById('errorMessage').innerText = msg;
        const btnContainer = document.getElementById('errorBtnContainer');
        if(isBalanceError) {
            btnContainer.innerHTML = \`
                <div class="flex gap-3 w-full">
                    <button onclick="closeErrorModal()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition">Cancel</button>
                    <a href="/deposit" class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition shadow-lg text-center flex items-center justify-center">Top Up</a>
                </div>
            \`;
        } else {
            btnContainer.innerHTML = \`<button onclick="closeErrorModal()" class="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition">Close</button>\`;
        }
        document.getElementById('errorModal').classList.remove('hidden');
    }

    async function processPurchase() {
        if(!selectedProductId) return;
        const confirmBtn = document.getElementById('confirmBtnAction');
        const originalText = confirmBtn.innerText;
        confirmBtn.innerText = "Processing...";
        confirmBtn.disabled = true;
        try {
            const res = await fetch("/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedProductId }) });
            const data = await res.json();
            closeConfirmModal();
            if(data.success) {
                document.getElementById('purchasedCode').innerText = data.code;
                document.getElementById('successModal').classList.remove('hidden');
                document.querySelectorAll('.balance-display').forEach(el => el.innerText = data.newBalance.toLocaleString() + " Ks");
            } else { 
                const isBalanceError = data.message === "Insufficient Balance";
                showErrorModal(data.message || "Purchase Failed", isBalanceError);
            }
        } catch (e) { showErrorModal("Connection Error"); } finally { confirmBtn.innerText = originalText; confirmBtn.disabled = false; }
    }

    function selectAvatar(avatar) {
        document.getElementById('selectedAvatarInput').value = avatar;
        document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('ring-4', 'ring-blue-500'));
        document.getElementById('av-' + avatar).classList.add('ring-4', 'ring-blue-500');
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
    /* Enhanced Loader */
    .loader { border: 4px solid rgba(59, 130, 246, 0.2); width: 45px; height: 45px; border-radius: 50%; border-left-color: #3b82f6; animation: spin 0.8s linear infinite; box-shadow: 0 0 15px rgba(59, 130, 246, 0.5); }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body class="min-h-screen flex flex-col relative">
  
  <div id="page-loader" class="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a] transition-opacity duration-300">
      <div class="flex flex-col items-center">
          <div class="loader mb-4"></div>
          <div class="text-blue-400 font-bold text-sm animate-pulse">LOADING...</div>
      </div>
  </div>

  <nav class="glass sticky top-0 z-40 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
      <a href="/" class="text-2xl font-bold text-blue-500 hover:text-blue-400 transition">🎮 GameStore</a>
      <div class="flex gap-4 items-center">
        ${user ? `
          <div class="flex items-center gap-3">
              <a href="/deposit" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full transition border border-slate-600 text-sm">
                 <span class="hidden md:inline text-slate-400">Balance:</span>
                 <span class="balance-display text-green-400 font-bold">${user.balance.toLocaleString()} Ks</span>
                 <span class="bg-green-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">+</span>
              </a>
              <a href="/profile" class="relative">
                <div class="w-9 h-9 rounded-md bg-slate-700 flex items-center justify-center text-xl border border-slate-500 shadow-sm hover:ring-2 ring-blue-500 transition">
                    ${user.avatar || "😎"}
                </div>
              </a>
              ${user.isAdmin ? '<a href="/admin" class="hidden md:block text-yellow-400 hover:text-yellow-300 font-semibold text-sm">Admin</a>' : ''}
          </div>
        ` : ``}
      </div>
    </div>
  </nav>

  ${bannerText ? `<div class="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-200 py-2"><div class="marquee-container max-w-7xl mx-auto"><div class="marquee-content font-medium tracking-wide">📢 ${bannerText}</div></div></div>` : ''}

  <main class="flex-grow container mx-auto px-4 py-8">
    ${content}
  </main>

  <div id="confirmModal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4 modal-content">
    <div class="bg-[#1e293b] border border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl transform transition-all scale-100 relative">
        <h3 class="text-xl font-bold text-white mb-2">Confirm Purchase?</h3>
        <p class="text-slate-400 mb-4">Are you sure you want to buy <br><span id="confirmName" class="text-blue-400 font-bold"></span> for <span id="confirmPrice" class="text-green-400 font-bold"></span>?</p>
        <div class="flex gap-3">
            <button onclick="closeConfirmModal()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition">Cancel</button>
            <button id="confirmBtnAction" onclick="processPurchase()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition shadow-lg shadow-blue-500/20">Yes, Buy</button>
        </div>
    </div>
  </div>

  <div id="successModal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4 modal-content">
    <div class="bg-[#1e293b] border border-green-500/30 rounded-2xl p-0 max-w-md w-full shadow-2xl overflow-hidden relative">
        <button onclick="closeSuccessModal()" class="absolute top-3 right-3 text-slate-400 hover:text-white text-xl">&times;</button>
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

  <div id="errorModal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4 modal-content">
    <div class="bg-[#1e293b] border border-red-500/30 rounded-2xl p-0 max-w-sm w-full shadow-2xl overflow-hidden relative">
        <button onclick="closeErrorModal()" class="absolute top-3 right-3 text-slate-400 hover:text-white text-xl font-bold z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">&times;</button>
        <div class="bg-red-600/20 p-6 text-center border-b border-red-500/20">
            <div class="text-5xl mb-2">⚠️</div>
            <h2 class="text-2xl font-bold text-red-400">Oops!</h2>
        </div>
        <div class="p-6 text-center">
            <p id="errorMessage" class="text-slate-300 mb-6 text-lg font-medium">Something went wrong.</p>
            <div id="errorBtnContainer"></div>
        </div>
    </div>
  </div>

  <footer class="text-center text-slate-600 py-6 text-sm">
    &copy; 2025 Digital Shop System
  </footer>
</body>
</html>
`;

export const AuthForm = (type: "Login" | "Register", error?: string) => `
<div class="max-w-md mx-auto glass p-8 rounded-2xl shadow-2xl">
  <h2 class="text-3xl font-bold text-center mb-6 text-white">${type}</h2>
  ${error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded mb-4 text-center">${error}</div>` : ''}
  <form method="POST" class="space-y-4">
    <div><label class="block text-sm font-medium text-slate-400 mb-1">Username</label><input type="text" name="username" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>
    <div><label class="block text-sm font-medium text-slate-400 mb-1">Password</label><input type="password" name="password" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>
    ${type === 'Login' ? `<label class="flex items-center gap-2 text-slate-400 text-sm cursor-pointer"><input type="checkbox" name="remember" class="rounded bg-slate-800 border-slate-600 text-blue-600 focus:ring-blue-500">Remember me (15 Days)</label>` : ''}
    <button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">${type}</button>
  </form>
  <p class="mt-4 text-center text-slate-400 text-sm">${type === 'Login' ? 'Don\'t have an account? <a href="/register" class="text-blue-400">Register</a>' : 'Already have an account? <a href="/login" class="text-blue-400">Login</a>'}</p>
</div>
`;

export const MaintenancePage = () => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }</style></head><body class="h-screen flex flex-col items-center justify-center p-4 text-center"><div class="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full"><div class="text-6xl mb-4">🚧</div><h1 class="text-3xl font-bold text-white mb-2">Under Maintenance</h1><p class="text-slate-400 mb-6">We are currently updating our server. Please check back later.</p><a href="/login" class="text-sm text-slate-600 hover:text-slate-400">Admin Login</a></div></body></html>`;

export const ProductCard = (p: Product) => {
  const isManual = p.type === 'manual';
  const manualStock = p.stock ? p.stock.length : 0;
  const stockDisplay = isManual ? `Stock: ${manualStock}` : `Stock: <span class="api-stock-loader animate-pulse" data-id="${p.id}">...</span>`;
  const isDisabled = isManual && manualStock === 0;
  
  const imageHtml = p.imageUrl 
      ? `<img src="${p.imageUrl}" class="w-24 h-24 rounded-lg object-cover border border-slate-700 shadow-md" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="w-24 h-24 rounded-lg bg-slate-800 items-center justify-center text-3xl hidden border border-slate-700 shadow-md">🎮</div>`
      : `<div class="w-24 h-24 rounded-lg bg-slate-800 flex items-center justify-center text-3xl border border-slate-700 shadow-md">🎮</div>`;

  return `
  <div class="product-card glass rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 transition transform hover:-translate-y-1 duration-300 p-4" data-name="${p.name}">
    <div class="flex gap-4">
        <div class="flex-shrink-0">${imageHtml}</div>
        <div class="flex-grow flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-start">
                    <h3 class="text-lg font-bold text-white leading-tight">${p.name}</h3>
                    <span id="badge-${p.id}" class="text-[10px] px-2 py-1 rounded whitespace-nowrap ${!isDisabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${stockDisplay}</span>
                </div>
                <p class="text-slate-400 text-xs mt-1 line-clamp-2">${p.description}</p>
            </div>
            <div class="mt-2">
                <div class="text-xl font-bold text-blue-400 mb-2">${p.price.toLocaleString()} Ks</div>
                <button id="btn-${p.id}" ${isDisabled ? 'disabled' : `onclick="confirmBuy('${p.id}', '${p.name}', '${p.price.toLocaleString()}')"`} class="w-full text-sm ${!isDisabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 cursor-not-allowed'} text-white font-bold py-2 rounded-lg transition flex justify-center items-center gap-2">${isDisabled ? 'Out of Stock' : '⚡ Buy Now'}</button>
            </div>
        </div>
    </div>
  </div>
  `;
};

export const HistoryTable = (transactions: Transaction[], nextCursor: string | null, activeTab: string) => {
    let rows = "";
    if (transactions.length === 0) { rows = `<tr><td colspan="4" class="p-8 text-center text-slate-500 flex flex-col items-center"><span class="text-4xl mb-2">📜</span><span>No ${activeTab} history found.</span></td></tr>`; } 
    else { 
        rows = transactions.map(t => {
            let color = 'text-white'; let sign = ''; let bg = 'bg-slate-700';
            if(t.type === 'purchase' || t.type === 'transfer_sent') { color = 'text-red-400'; sign = '-'; bg = 'bg-red-500/20'; }
            else if (t.type === 'topup' || t.type === 'voucher' || t.type === 'bonus' || t.type === 'transfer_received' || t.type === 'refund') { color = 'text-green-400'; sign = '+'; bg = 'bg-green-500/20'; }
            return `<tr class="border-b border-slate-700 hover:bg-slate-800/50 transition"><td class="p-4 text-sm text-slate-400">${new Date(t.date).toLocaleDateString()}</td><td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${bg} ${color}">${t.type.replace('_', ' ')}</span></td><td class="p-4 font-medium text-white">${t.itemName} ${t.detail ? `<div class="text-xs text-slate-500 mt-1 font-mono truncate w-32 md:w-64">${t.detail.substring(0, 30)}...</div>` : ''}</td><td class="p-4 text-right ${color} font-bold">${sign}${t.amount.toLocaleString()} Ks</td></tr>`;
        }).join(""); 
    }
    const tabs = [{ id: 'all', label: 'All' }, { id: 'purchase', label: 'Purchases' }, { id: 'topup', label: 'Top Up' }];
    const tabsHtml = tabs.map(t => `<a href="/history?filter=${t.id}" class="flex-1 py-2 text-center text-sm font-bold rounded-lg transition ${activeTab === t.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">${t.label}</a>`).join("");
    return `<div class="flex gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl">${tabsHtml}</div><div class="glass rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-4">Date</th><th class="p-4">Type</th><th class="p-4">Description</th><th class="p-4 text-right">Amount</th></tr></thead><tbody class="divide-y divide-slate-700">${rows}</tbody></table></div>${nextCursor ? `<div class="p-4 text-center border-t border-slate-700"><a href="/history?filter=${activeTab}&cursor=${nextCursor}" class="inline-block bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded transition">Load Next 10 Entries</a></div>` : ''}</div>`;
};

export const ProfilePage = (user: User, bonusConfig: {active: boolean, amount: number}, message?: {type: 'success'|'error', text: string}) => {
    const avatarGrid = AVATARS.map(av => `<div id="av-${av}" onclick="selectAvatar('${av}')" class="avatar-option text-4xl p-3 bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-700 transition border border-slate-600 flex justify-center items-center ${user.avatar === av ? 'ring-4 ring-blue-500' : ''}">${av}</div>`).join("");
    return Layout("Profile", `
        <div class="max-w-4xl mx-auto flex flex-col lg:grid lg:grid-cols-2 gap-8 w-full">
            <div class="space-y-8 w-full">
                <div class="glass p-8 rounded-2xl text-center w-full">
                    <div class="text-6xl mb-4">${user.avatar || "😎"}</div>
                    <h2 class="text-2xl font-bold text-white mb-1">${user.username}</h2>
                    <p class="text-green-400 font-bold text-lg">${user.balance.toLocaleString()} Ks</p>
                    <div class="mt-6 flex justify-center gap-3">
                         <a href="/history" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm">History</a>
                         <a href="/transfer" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg> Transfer</a>
                         <a href="/logout" class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm">Logout</a>
                    </div>
                    ${user.isAdmin ? `<a href="/admin" class="mt-4 inline-block text-yellow-400 text-sm font-bold border border-yellow-500/30 px-4 py-1 rounded-full">Access Admin Panel</a>` : ''}
                </div>
                ${bonusConfig.active && !user.hasClaimedBonus ? `<div class="glass p-6 rounded-xl border-l-4 border-pink-500 bg-pink-900/20 flex justify-between items-center"><div><h3 class="text-lg font-bold text-white">🎁 Welcome Bonus</h3><p class="text-pink-200 text-sm">Claim your ${bonusConfig.amount.toLocaleString()} Ks gift!</p></div><form action="/profile/claim-bonus" method="POST" style="margin:0"><button class="bg-pink-600 hover:bg-pink-500 text-white font-bold px-4 py-2 rounded-lg shadow-lg animate-pulse">Claim</button></form></div>` : ''}
                <div class="glass p-8 rounded-2xl border-t-4 border-purple-500 w-full"><h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">🎟️ Redeem Voucher</h3><form action="/redeem" method="POST" class="flex gap-2"><input name="code" placeholder="Code" required class="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none uppercase min-w-0"><button class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 rounded-lg transition">Claim</button></form></div>
                <div class="glass p-8 rounded-2xl w-full"><h3 class="text-xl font-bold text-white mb-4">🔒 Change Password</h3><form action="/profile/password" method="POST" class="space-y-3"><input type="password" name="oldPassword" placeholder="Current Password" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white"><input type="password" name="newPassword" placeholder="New Password" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white"><button class="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition">Update Password</button></form></div>
            </div>
            <div class="glass p-8 rounded-2xl w-full h-fit"><h3 class="text-xl font-bold text-white mb-6">Choose Avatar</h3><form action="/profile/avatar" method="POST"><input type="hidden" name="avatar" id="selectedAvatarInput" value="${user.avatar || '😎'}"><div class="grid grid-cols-4 gap-4 mb-6">${avatarGrid}</div><button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20">Save Profile Picture</button></form></div>
        </div>
        ${message ? `<div class="fixed bottom-5 right-5 ${message.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-6 py-3 rounded-xl shadow-2xl animate-bounce">${message.text}</div>` : ''}
    `, user);
}

export const TransferPage = (user: User, error?: string) => Layout("Transfer", `
    <div class="max-w-md mx-auto glass p-8 rounded-2xl border border-blue-500/30">
        <h1 class="text-2xl font-bold text-white mb-6 flex items-center gap-2"><svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg> Transfer Money</h1>
        ${error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg mb-4 text-sm text-center">${error}</div>` : ''}
        <form method="POST" action="/transfer" class="space-y-4">
            <div><label class="block text-sm font-medium text-slate-400 mb-1">Recipient Username</label><input type="text" name="receiver" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter username"></div>
            <div><label class="block text-sm font-medium text-slate-400 mb-1">Amount (Ks)</label><input type="number" name="amount" min="500" max="50000" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Min: 500 - Max: 50,000"></div>
            <div class="text-xs text-slate-500 bg-slate-800 p-3 rounded border border-slate-700"><p>ℹ️ <strong>Rules:</strong></p><ul class="list-disc pl-4 mt-1 space-y-1"><li>Min: 500 Ks | Max: 50,000 Ks</li><li>If both users > 30 days: <strong>Free</strong></li><li>If any user < 30 days: <strong>50 Ks Fee</strong></li></ul></div>
            <button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg">Confirm Transfer</button>
        </form>
        <div class="mt-4 text-center"><a href="/profile" class="text-slate-500 hover:text-white text-sm">Cancel</a></div>
    </div>
`, user);

// New: Admin Components
export const AdminUserTable = (usersHtml: string, nextCursor: string | null) => `
<div class="glass rounded-xl overflow-hidden">
    <div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-3">User</th><th class="p-3 text-right">Balance</th><th class="p-3 text-center">Status</th></tr></thead><tbody class="divide-y divide-slate-700">${usersHtml}</tbody></table></div>
    <div class="p-3 border-t border-slate-700 flex justify-between text-sm">
        ${nextCursor ? `<a href="/admin?user_cursor=${nextCursor}" class="text-blue-400 hover:underline">Next Page →</a>` : '<span class="text-slate-600">End of list</span>'}
    </div>
</div>`;

export const AdminSalesTable = (sales: GlobalSale[], nextCursor: string | null) => {
    let rows = sales.map(s => `
        <tr class="border-b border-slate-700 hover:bg-slate-800/50 text-sm">
            <td class="p-3 text-slate-400">${new Date(s.date).toLocaleString()}</td>
            <td class="p-3 text-white font-bold">${s.username}</td>
            <td class="p-3">${s.itemName}</td>
            <td class="p-3 text-green-400">${s.amount}</td>
            <td class="p-3">
                ${s.refunded ? '<span class="text-red-500 text-xs font-bold">REFUNDED</span>' 
                : `<form action="/admin/refund" method="POST" onsubmit="return confirm('Refund ${s.username}?')">
                    <input type="hidden" name="username" value="${s.username}">
                    <input type="hidden" name="date" value="${s.date}">
                    <input type="hidden" name="id" value="${s.id}">
                    <button class="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded">Refund</button>
                   </form>`}
            </td>
        </tr>`).join("");
        
    if(sales.length === 0) rows = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No recent sales.</td></tr>`;

    return `
    <div class="glass rounded-xl overflow-hidden mt-6">
        <div class="px-6 py-4 border-b border-slate-700"><h3 class="text-lg font-bold text-white">🛒 Recent Sales Log</h3></div>
        <div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-3">Date</th><th class="p-3">User</th><th class="p-3">Item</th><th class="p-3">Price</th><th class="p-3">Action</th></tr></thead><tbody class="divide-y divide-slate-700">${rows}</tbody></table></div>
        ${nextCursor ? `<div class="p-3 text-center border-t border-slate-700"><a href="/admin?sale_cursor=${nextCursor}" class="text-blue-400 hover:underline">Load More Sales</a></div>` : ''}
    </div>`;
}
