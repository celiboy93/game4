import { User, Product, Transaction, GlobalSale, TwoDResult, TwoDBet } from "./db.ts";

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
    function toggleProductInputs() {
        const typeEl = document.getElementById('productType');
        if (!typeEl) return;
        const type = typeEl.value;
        ['input-manual', 'input-api', 'input-shared'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
        if (type === 'manual') document.getElementById('input-manual').style.display = 'block';
        else if (type === 'api') document.getElementById('input-api').style.display = 'block';
        else if (type === 'shared') document.getElementById('input-shared').style.display = 'block';
    }
// --- 2D BETTING SPINNER & FETCH LOGIC ---
function handle2DBet(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerHTML = '<div class="loader-sm mx-auto"></div>';
    btn.disabled = true;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    fetch('/2d/bet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            document.getElementById('purchasedCode').innerText = "Bet Placed Successfully!";
            document.getElementById('copyBtnModal').style.display = 'none'; 
            document.getElementById('successModal').classList.remove('hidden');
            document.querySelectorAll('.balance-display').forEach(el => el.innerText = result.newBalance.toLocaleString() + " Ks");
            const closeBtn = document.querySelector('#successModal button:last-child');
            closeBtn.onclick = () => window.location.reload(); // Reload after close to update bets list
        } else { showErrorModal(result.message); }
    })
    .catch(() => showErrorModal("Connection Error"))
    .finally(() => { btn.innerText = originalText; btn.disabled = false; });
    return false;
}
    function selectAvatar(avatar) {
        document.getElementById('selectedAvatarInput').value = avatar;
        document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('ring-4', 'ring-blue-500'));
        document.getElementById('av-' + avatar).classList.add('ring-4', 'ring-blue-500');
    }

    function updateBetInput() {
        const type = document.getElementById('betType').value;
        const input = document.getElementById('betNumber');
        if (type === 'double') {
            input.value = 'XX'; input.disabled = true; input.classList.add('opacity-50');
        } else {
            input.disabled = false; input.classList.remove('opacity-50');
            if (type === 'head') { input.placeholder = "0-9 (Head)"; input.maxLength = 1; input.value = ''; }
            else if (type === 'tail') { input.placeholder = "0-9 (Tail)"; input.maxLength = 1; input.value = ''; }
            else { input.placeholder = "00-99"; input.maxLength = 2; input.value = ''; }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        toggleProductInputs();
        const path = window.location.pathname;
        const navIds = {'/':'nav-home','/history':'nav-history','/profile':'nav-profile','/deposit':'nav-profile','/transfer':'nav-profile','/2d':'nav-2d'};
        const activeId = navIds[path] || 'nav-home';
        const el = document.getElementById(activeId);
        if(el) { el.classList.remove('text-slate-500'); el.classList.add('text-blue-500'); }

        const sliderTrack = document.getElementById('sliderTrack');
        if(sliderTrack && sliderTrack.children.length > 1) {
            let index = 0; const count = sliderTrack.children.length;
            setInterval(() => { index = (index + 1) % count; sliderTrack.style.transform = \`translateX(-\${index * 100}%)\`; }, 3500);
        }
        
        document.querySelectorAll(".api-stock-loader").forEach(async (el) => {
            const id = el.dataset.id;
            try {
                const res = await fetch("/check-stock?id=" + id);
                const text = await res.text();
                el.innerText = text;
                if(text.includes("0") || text === "?") { 
                    const btn = document.getElementById("btn-" + id);
                    const badge = document.getElementById("badge-" + id);
                    if(btn) { btn.disabled = true; btn.className = "w-full text-sm bg-slate-700 cursor-not-allowed text-white font-bold py-2 rounded-lg transition flex justify-center items-center gap-2"; btn.innerText = "🚫 Out of Stock"; btn.removeAttribute("onclick"); }
                    if(badge) { badge.className = "text-[10px] px-2 py-1 rounded whitespace-nowrap bg-red-500/20 text-red-400"; }
                }
            } catch { el.innerText = "?"; }
        });

        const loader = document.getElementById('page-loader');
        document.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript') && !e.ctrlKey && !e.metaKey && !href.startsWith('http')) {
                    loader.classList.remove('hidden');
                }
            });
        });

        const liveNum = document.getElementById('live-2d-num');
        if(liveNum) {
            setInterval(async () => {
                try {
                    const res = await fetch('/api/2d-proxy');
                    const data = await res.json();
                    if(data.live) {
                        liveNum.innerText = data.live.twod;
                        document.getElementById('live-set').innerText = data.live.set;
                        document.getElementById('live-val').innerText = data.live.value;
                        document.getElementById('live-time').innerText = data.live.time;
                    }
                } catch {}
            }, 2000);
        }
    });
    
    window.addEventListener('pageshow', (event) => { if (event.persisted) { document.getElementById('page-loader').classList.add('hidden'); } });

    function copyPurchasedCode() {
        const btn = document.getElementById('copyBtnModal');
        const text = btn.getAttribute('data-code');
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.innerText; 
            btn.innerText = '✅ Copied!';
            btn.className = 'w-full bg-green-600 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg';
            setTimeout(() => { 
                btn.innerText = "Copy Code"; 
                btn.className = 'w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg';
            }, 2000);
        });
    }

    function filterProducts() {
        const input = document.getElementById('searchInput');
        const filter = input.value.toLowerCase();
        document.querySelectorAll('.product-card').forEach(node => {
            const name = node.dataset.name.toLowerCase();
            node.style.display = name.includes(filter) ? "block" : "none";
        });
    }

    let selectedProductId = null;
    function confirmBuy(id, name, price) {
        selectedProductId = id;
        document.getElementById('confirmName').innerText = name;
        document.getElementById('confirmPrice').innerText = price + " Ks";
        document.getElementById('confirmModal').classList.remove('hidden');
    }
    function closeModals() { 
        document.getElementById('confirmModal').classList.add('hidden'); 
        document.getElementById('successModal').classList.add('hidden'); 
        document.getElementById('errorModal').classList.add('hidden');
        selectedProductId = null; 
    }

    async function processPurchase() {
        if(!selectedProductId) return;
        const confirmBtn = document.getElementById('confirmBtnAction');
        const originalText = confirmBtn.innerText;
        confirmBtn.innerHTML = '<div class="loader-sm mx-auto"></div>';
        confirmBtn.disabled = true;
        try {
            const res = await fetch("/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedProductId }) });
            const data = await res.json();
            closeModals();
            if(data.success) {
                document.getElementById('purchasedCode').innerText = data.code;
                document.getElementById('copyBtnModal').setAttribute('data-code', data.rawCode);
                document.getElementById('successModal').classList.remove('hidden');
                document.querySelectorAll('.balance-display').forEach(el => el.innerText = data.newBalance.toLocaleString() + " Ks");
            } else { 
                document.getElementById('errorMessage').innerText = data.message || "Purchase Failed";
                const btnContainer = document.getElementById('errorBtnContainer');
                if(data.message === "Insufficient Balance") {
                    btnContainer.innerHTML = \`<div class="flex gap-3 w-full"><button onclick="closeModals()" class="bg-slate-700 text-white font-bold py-3 px-4 rounded-xl transition">✕</button><a href="/deposit" class="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl transition shadow-lg text-center flex items-center justify-center">Top Up Now</a></div>\`;
                } else {
                    btnContainer.innerHTML = \`<button onclick="closeModals()" class="w-full bg-slate-700 text-white font-bold py-3 rounded-xl transition">Close</button>\`;
                }
                document.getElementById('errorModal').classList.remove('hidden');
            }
        } catch (e) { alert("Connection Error"); } finally { confirmBtn.innerText = originalText; confirmBtn.disabled = false; }
    }
  </script>
  <style>
    body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }
    .glass { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
    .glass-nav { background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); border-top: 1px solid rgba(255, 255, 255, 0.1); }
    .modal-backdrop { background-color: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px); }
    .code-box { background-image: radial-gradient(#334155 1px, transparent 1px); background-size: 10px 10px; }
    .marquee-container { overflow: hidden; white-space: nowrap; position: relative; }
    .marquee-content { display: inline-block; animation: marquee 15s linear infinite; padding-left: 100%; }
    @keyframes marquee { 0% { transform: translate(0, 0); } 100% { transform: translate(-100%, 0); } }
    .loader { border: 4px solid rgba(59, 130, 246, 0.2); width: 45px; height: 45px; border-radius: 50%; border-left-color: #3b82f6; animation: spin 0.8s linear infinite; box-shadow: 0 0 15px rgba(59, 130, 246, 0.5); }
    .loader-sm { border: 3px solid rgba(255, 255, 255, 0.3); width: 24px; height: 24px; border-radius: 50%; border-left-color: #ffffff; animation: spin 0.8s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    #sliderTrack { transition: transform 0.5s ease-in-out; will-change: transform; }
    .slide-item { min-width: 100%; flex-shrink: 0; }
    .bottom-nav-container { background: #0f172a; border-top: 1px solid #334155; box-shadow: 0 -4px 20px rgba(0,0,0,0.4); }
  </style>
</head>
<body class="min-h-screen flex flex-col relative pb-24">
  <div id="page-loader" class="hidden fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"><div class="loader"></div></div>

  <nav class="glass sticky top-0 z-40 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
      <a href="/" class="flex items-center gap-2 group">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
        </div>
        <span class="text-lg font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 drop-shadow-sm uppercase">KAIRIZY STORE</span>
      </a>
      <div class="flex gap-3 items-center">
        ${user ? `
          <div class="flex items-center gap-3">
              <a href="/deposit" class="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 rounded-full border border-slate-600 text-sm backdrop-blur-md transition">
                 <span class="hidden md:inline text-slate-400">Balance:</span>
                 <span class="balance-display text-green-400 font-bold">${user.balance.toLocaleString()} Ks</span>
                 <span class="bg-green-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">+</span>
              </a>
              <a href="/profile" class="hidden md:block relative"><div class="w-9 h-9 rounded-md bg-slate-700 flex items-center justify-center text-xl border border-slate-500 shadow-sm hover:ring-2 ring-blue-500 transition">${user.avatar || "😎"}</div></a>
              ${user.isAdmin ? '<a href="/admin" class="hidden md:block text-yellow-400 hover:text-yellow-300 font-semibold text-sm">Admin</a>' : ''}
          </div>
        ` : `<a href="/login" class="text-slate-300 hover:text-white text-sm font-medium">Login</a><a href="/register" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition">Register</a>`}
      </div>
    </div>
  </nav>

  ${bannerText ? `<div class="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-200 py-2"><div class="marquee-container max-w-7xl mx-auto"><div class="marquee-content font-medium tracking-wide">📢 ${bannerText}</div></div></div>` : ''}

  <main class="flex-grow container mx-auto px-4 py-6">${content}</main>

  ${user ? `
  <div class="md:hidden fixed bottom-0 left-0 w-full z-[50] bottom-nav-container">
      <div class="flex justify-around items-center py-3">
          <a href="/" id="nav-home" class="flex flex-col items-center gap-1 text-slate-500 hover:text-blue-400 transition w-full"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg><span class="text-[10px] font-medium">Home</span></a>
          <a href="/2d" id="nav-2d" class="flex flex-col items-center gap-1 text-slate-500 hover:text-blue-400 transition w-full"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg><span class="text-[10px] font-medium">2D Live</span></a>
          <a href="/history" id="nav-history" class="flex flex-col items-center gap-1 text-slate-500 hover:text-blue-400 transition w-full"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="text-[10px] font-medium">History</span></a>
          <a href="/profile" id="nav-profile" class="flex flex-col items-center gap-1 text-slate-500 hover:text-blue-400 transition w-full"><div class="w-6 h-6 flex items-center justify-center text-lg leading-none">${user.avatar || "👤"}</div><span class="text-[10px] font-medium">Profile</span></a>
      </div>
  </div>` : ''}

  <div id="confirmModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center modal-backdrop px-4 modal-content"><div class="bg-[#1e293b] border border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl transform transition-all scale-100 relative"><h3 class="text-xl font-bold text-white mb-2">Confirm Purchase?</h3><p class="text-slate-400 mb-4">Are you sure you want to buy <br><span id="confirmName" class="text-blue-400 font-bold"></span> for <span id="confirmPrice" class="text-green-400 font-bold"></span>?</p><div class="flex gap-3"><button onclick="closeModals()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition">Cancel</button><button id="confirmBtnAction" onclick="processPurchase()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition shadow-lg shadow-blue-500/20">Yes, Buy</button></div></div></div>
  <div id="successModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center modal-backdrop px-4 modal-content"><div class="bg-[#1e293b] border border-green-500/30 rounded-2xl p-0 max-w-md w-full shadow-2xl overflow-hidden relative"><button onclick="closeModals()" class="absolute top-3 right-3 text-slate-400 hover:text-white text-xl">&times;</button><div class="bg-green-600/20 p-6 text-center border-b border-green-500/20"><div class="text-5xl mb-2">🎉</div><h2 class="text-2xl font-bold text-green-400">Successful!</h2></div><div class="p-6"><p class="text-slate-400 text-sm mb-2 uppercase tracking-wider font-semibold text-center">Your Code:</p><div class="code-box bg-slate-900 border-2 border-dashed border-slate-600 rounded-xl p-4 mb-6 relative"><pre id="purchasedCode" class="font-mono text-green-400 whitespace-pre-wrap break-all text-base leading-relaxed text-center"></pre></div><div class="flex flex-col gap-3"><button id="copyBtnModal" onclick="copyPurchasedCode()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg">Copy Code</button><button onclick="closeModals()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl transition">Close</button></div></div></div></div>
  <div id="errorModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center modal-backdrop px-4 modal-content"><div class="bg-[#1e293b] border border-red-500/30 rounded-2xl p-0 max-w-sm w-full shadow-2xl overflow-hidden relative"><button onclick="closeModals()" class="absolute top-3 right-3 text-slate-400 hover:text-white text-xl font-bold z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">&times;</button><div class="bg-red-600/20 p-6 text-center border-b border-red-500/20"><div class="text-5xl mb-2">⚠️</div><h2 class="text-2xl font-bold text-red-400">Oops!</h2></div><div class="p-6 text-center"><p id="errorMessage" class="text-slate-300 mb-6 text-lg font-medium">Something went wrong.</p><div id="errorBtnContainer"></div></div></div></div>
</body>
</html>
`;

export const ImageSlider = (images: string[]) => `<div class="relative w-full h-48 md:h-64 overflow-hidden rounded-2xl shadow-2xl mb-6 border border-slate-700"><div id="sliderTrack" class="flex h-full w-full">${images.map(img => `<div class="slide-item w-full h-full"><img src="${img}" class="w-full h-full object-cover"></div>`).join('')}</div><div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div></div>`;
export const AuthForm = (type: "Login" | "Register", error?: string) => `<div class="max-w-md mx-auto glass p-8 rounded-2xl shadow-2xl mt-10"><h2 class="text-3xl font-bold text-center mb-6 text-white">${type}</h2>${error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded mb-4 text-center">${error}</div>` : ''}<form method="POST" class="space-y-4"><div><label class="block text-sm font-medium text-slate-400 mb-1">Username</label><input type="text" name="username" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div><div><label class="block text-sm font-medium text-slate-400 mb-1">Password</label><input type="password" name="password" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>${type === 'Login' ? `<div class="flex justify-between items-center"><label class="flex items-center gap-2 text-slate-400 text-sm cursor-pointer"><input type="checkbox" name="remember" class="rounded bg-slate-800 border-slate-600 text-blue-600 focus:ring-blue-500">Remember me</label><a href="/forgot" class="text-sm text-blue-400 hover:text-blue-300">Forgot Password?</a></div>` : ''}<button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">${type}</button></form><p class="mt-4 text-center text-slate-400 text-sm">${type === 'Login' ? 'Don\'t have an account? <a href="/register" class="text-blue-400">Register</a>' : 'Already have an account? <a href="/login" class="text-blue-400">Login</a>'}</p></div>`;
export const MaintenancePage = () => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }</style></head><body class="h-screen flex flex-col items-center justify-center p-4 text-center"><div class="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full"><div class="text-6xl mb-4">🚧</div><h1 class="text-3xl font-bold text-white mb-2">Under Maintenance</h1><p class="text-slate-400 mb-6">We are currently updating our server. Please check back later.</p><a href="/login" class="text-sm text-slate-600 hover:text-slate-400">Admin Login</a></div></body></html>`;
export const ProductCard = (p: Product) => { const isManual = p.type === 'manual'; const manualStock = p.stock ? p.stock.length : 0; const stockDisplay = isManual ? `Stock: ${manualStock}` : p.type === 'shared' ? `Limit: ${Math.max(0, (p.sharedCapacity||0)-(p.sharedSold||0))}/${p.sharedCapacity}` : `Stock: <span class="api-stock-loader animate-pulse" data-id="${p.id}">...</span>`; const isDisabled = (!isManual && p.type !== 'api' && p.type !== 'shared') ? true : (isManual && manualStock === 0) || (p.type === 'shared' && (p.sharedCapacity||0) <= (p.sharedSold||0)); const imageHtml = p.imageUrl ? `<img src="${p.imageUrl}" class="w-24 h-24 rounded-lg object-cover border border-slate-700 shadow-md" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="w-24 h-24 rounded-lg bg-slate-800 items-center justify-center text-3xl hidden border border-slate-700 shadow-md">🎮</div>` : `<div class="w-24 h-24 rounded-lg bg-slate-800 flex items-center justify-center text-3xl border border-slate-700 shadow-md">🎮</div>`; const priceDisplay = (p.originalPrice && p.originalPrice > p.price) ? `<span class="text-xs text-slate-500 line-through mr-1 font-medium">${p.originalPrice.toLocaleString()} Ks</span><span class="text-xl font-bold text-blue-400">${p.price.toLocaleString()} Ks</span>` : `<div class="text-xl font-bold text-blue-400">${p.price.toLocaleString()} Ks</div>`; return `<div class="product-card glass rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 transition transform hover:-translate-y-1 duration-300 p-4" data-name="${p.name}"><div class="flex gap-4"><div class="flex-shrink-0">${imageHtml}</div><div class="flex-grow flex flex-col justify-between"><div><div class="flex justify-between items-start"><h3 class="text-lg font-bold text-white leading-tight">${p.name}</h3><span id="badge-${p.id}" class="text-[10px] px-2 py-1 rounded whitespace-nowrap ${!isDisabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${stockDisplay}</span></div><p class="text-slate-400 text-xs mt-1 line-clamp-2">${p.description}</p></div><div class="mt-2"><div class="mb-2 flex items-baseline">${priceDisplay}</div><button id="btn-${p.id}" ${isDisabled ? 'disabled' : `onclick="confirmBuy('${p.id}', '${p.name}', '${p.price.toLocaleString()}')"`} class="w-full text-sm ${!isDisabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 cursor-not-allowed'} text-white font-bold py-2 rounded-lg transition flex justify-center items-center gap-2">${isDisabled ? 'Out of Stock' : '⚡ Buy Now'}</button></div></div></div></div>`; };
export const HistoryTable = (transactions: Transaction[], nextCursor: string | null, activeTab: string) => { let rows = ""; if (transactions.length === 0) { rows = `<tr><td colspan="4" class="p-8 text-center text-slate-500 flex flex-col items-center"><span class="text-4xl mb-2">📜</span><span>No ${activeTab} history found.</span></td></tr>`; } else { rows = transactions.map(t => { let color = 'text-white'; let sign = ''; let bg = 'bg-slate-700'; if(t.type === 'purchase' || t.type === 'transfer_sent') { color = 'text-red-400'; sign = '-'; bg = 'bg-red-500/20'; } else if (t.type === 'topup' || t.type === 'voucher' || t.type === 'bonus' || t.type === 'transfer_received' || t.type === 'refund' || t.type === 'win_2d') { color = 'text-green-400'; sign = '+'; bg = 'bg-green-500/20'; } const dateStr = new Date(t.date).toLocaleString("en-US", { timeZone: "Asia/Yangon" }); return `<tr class="border-b border-slate-700 hover:bg-slate-800/50 transition"><td class="p-4 text-sm text-slate-400">${dateStr}</td><td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${bg} ${color}">${t.type.replace('_', ' ')}</span></td><td class="p-4 font-medium text-white">${t.itemName} ${t.detail ? `<div class="text-xs text-slate-500 mt-1 font-mono truncate w-32 md:w-64">${t.detail.substring(0, 30)}...</div>` : ''}</td><td class="p-4 text-right ${color} font-bold">${sign}${t.amount.toLocaleString()} Ks</td></tr>`; }).join(""); } const tabs = [{ id: 'all', label: 'All' }, { id: 'purchase', label: 'Purchases' }, { id: 'topup', label: 'Top Up' }]; const tabsHtml = tabs.map(t => `<a href="/history?filter=${t.id}" class="flex-1 py-2 text-center text-sm font-bold rounded-lg transition ${activeTab === t.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">${t.label}</a>`).join(""); return `<div class="flex gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl">${tabsHtml}</div><div class="glass rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-4">Date</th><th class="p-4">Type</th><th class="p-4">Description</th><th class="p-4 text-right">Amount</th></tr></thead><tbody class="divide-y divide-slate-700">${rows}</tbody></table></div>${nextCursor ? `<div class="p-4 text-center border-t border-slate-700"><a href="/history?filter=${activeTab}&cursor=${nextCursor}" class="inline-block bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded transition">Load Next 10 Entries</a></div>` : ''}</div>`; };
export const TwoDPage = (user: User, bets: TwoDBet[]) => { let betHistoryHtml = ''; if(bets.length === 0) { betHistoryHtml = '<div class="text-center p-4 text-slate-500 text-xs">No active bets today.</div>'; } else { bets.forEach(b => { let statusColor = 'text-yellow-400'; if(b.status === 'win') statusColor = 'text-green-400'; if(b.status === 'lose') statusColor = 'text-red-400'; betHistoryHtml += `<div class="flex justify-between items-center p-3 border-b border-slate-700 last:border-0"><div class="text-xs text-slate-400">${b.session} <br> ${new Date(b.timestamp).toLocaleTimeString("en-US", { timeZone: "Asia/Yangon" })}</div><div class="font-bold text-white text-lg">${b.number}</div><div class="text-right"><div class="text-green-400 text-sm">${b.amount} Ks</div><div class="text-[10px] uppercase ${statusColor}">${b.status}</div></div></div>`; }); } return Layout("2D Live", `<div class="max-w-md mx-auto"><div class="glass rounded-2xl p-1 mb-6 border border-yellow-500/30 relative overflow-hidden"><div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 to-red-500"></div><div class="p-6 text-center"><div class="flex justify-center items-center gap-2 mb-4"><span class="relative flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span><h2 class="text-lg font-bold text-slate-300 tracking-widest uppercase">Thai SET Index</h2></div><div class="mb-6"><div class="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 tracking-tighter drop-shadow-xl" id="live-2d-num">--</div><div class="text-sm text-slate-500 font-mono mt-2">Updated: <span id="live-time">--:--:--</span></div></div><div class="grid grid-cols-2 gap-4 text-sm"><div class="bg-slate-800 p-3 rounded-xl border border-slate-700"><div class="text-slate-400 mb-1">SET</div><div class="text-xl font-bold text-blue-400 font-mono" id="live-set">0.00</div></div><div class="bg-slate-800 p-3 rounded-xl border border-slate-700"><div class="text-slate-400 mb-1">VALUE</div><div class="text-xl font-bold text-green-400 font-mono" id="live-val">0.00</div></div></div></div></div><div class="glass p-6 rounded-2xl mb-6 border border-blue-500/30"><h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">🎰 Place Bet</h3><form onsubmit="return handle2DBet(event)" class="space-y-3"><div class="flex gap-2 mb-2"><select name="betType" id="betType" onchange="updateBetInput()" class="flex-1 bg-slate-800 border border-slate-600 rounded-lg p-2 text-white text-sm outline-none"><option value="direct">Direct (ရိုးရိုး)</option><option value="r">Reverse (R)</option><option value="head">Head (ထိပ်)</option><option value="tail">Tail (နောက်)</option><option value="double">Doubles (အပူး)</option></select></div><div class="grid grid-cols-2 gap-3"><input name="number" id="betNumber" type="text" placeholder="00-99" maxlength="2" required class="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-center text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none"><input name="amount" type="number" min="100" placeholder="Amount (Ks)" required class="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-center text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none"></div><button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20">Bet Now</button></form></div><div class="glass rounded-xl overflow-hidden border border-slate-700/50 mb-6"><div class="px-4 py-3 bg-slate-800/50 border-b border-slate-700 text-slate-300 font-bold text-sm uppercase tracking-wider">My Bets (Today)</div><div class="max-h-48 overflow-y-auto">${betHistoryHtml}</div></div><div class="glass rounded-xl overflow-hidden border border-slate-700/50"><div class="flex justify-between items-center px-4 py-3 bg-slate-800/50 border-b border-slate-700"><span class="text-slate-300 font-bold text-sm uppercase tracking-wider">History</span><input type="month" id="month-picker" value="${new Date().toISOString().slice(0, 7)}" class="bg-slate-900 text-white text-xs p-1 rounded border border-slate-600 outline-none"></div><div id="history-list" class="max-h-64 overflow-y-auto"><div class="p-4 text-center text-slate-500 text-xs">Loading history...</div></div></div></div>`, user); }
export const ProfilePage = (user: User, bonusConfig: {active: boolean, amount: number}, message?: {type: 'success'|'error', text: string}) => { const avatarGrid = AVATARS.map(av => `<div id="av-${av}" onclick="selectAvatar('${av}')" class="avatar-option text-4xl p-3 bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-700 transition border border-slate-600 flex justify-center items-center ${user.avatar === av ? 'ring-4 ring-blue-500' : ''}">${av}</div>`).join(""); return Layout("Profile", `<div class="max-w-4xl mx-auto flex flex-col lg:grid lg:grid-cols-2 gap-8 w-full"><div class="space-y-8 w-full"><div class="glass p-8 rounded-2xl text-center w-full"><div class="text-6xl mb-4">${user.avatar || "😎"}</div><h2 class="text-2xl font-bold text-white mb-1">${user.username}</h2><p class="text-green-400 font-bold text-lg">${user.balance.toLocaleString()} Ks</p><div class="mt-6 flex justify-center gap-3"><a href="/history" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm">History</a><a href="/transfer" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg> Transfer</a><a href="/logout" class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm">Logout</a></div>${user.isAdmin ? `<a href="/admin" class="mt-4 inline-block text-yellow-400 text-sm font-bold border border-yellow-500/30 px-4 py-1 rounded-full">Access Admin Panel</a>` : ''}</div>${bonusConfig.active && !user.hasClaimedBonus ? `<div class="glass p-6 rounded-xl border-l-4 border-pink-500 bg-pink-900/20 flex justify-between items-center"><div><h3 class="text-lg font-bold text-white">🎁 Welcome Bonus</h3><p class="text-pink-200 text-sm">Claim your ${bonusConfig.amount.toLocaleString()} Ks gift!</p></div><form action="/profile/claim-bonus" method="POST" style="margin:0"><button class="bg-pink-600 hover:bg-pink-500 text-white font-bold px-4 py-2 rounded-lg shadow-lg animate-pulse">Claim</button></form></div>` : ''}<div class="glass p-8 rounded-2xl border-t-4 border-purple-500 w-full"><h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">🎟️ Redeem Voucher</h3><form action="/redeem" method="POST" class="flex gap-2"><input name="code" placeholder="Code" required class="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none uppercase min-w-0"><button class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 rounded-lg transition">Claim</button></form></div><div class="glass p-8 rounded-2xl w-full"><h3 class="text-xl font-bold text-white mb-4">🔒 Change Password</h3><form action="/profile/password" method="POST" class="space-y-3"><input type="password" name="oldPassword" placeholder="Current Password" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white"><input type="password" name="newPassword" placeholder="New Password" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white"><button class="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition">Update Password</button></form></div></div><div class="glass p-8 rounded-2xl w-full h-fit"><h3 class="text-xl font-bold text-white mb-6">Choose Avatar</h3><form action="/profile/avatar" method="POST"><input type="hidden" name="avatar" id="selectedAvatarInput" value="${user.avatar || '😎'}"><div class="grid grid-cols-4 gap-4 mb-6">${avatarGrid}</div><button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20">Save Profile Picture</button></form></div></div>${message ? `<div class="fixed bottom-5 right-5 ${message.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-6 py-3 rounded-xl shadow-2xl animate-bounce">${message.text}</div>` : ''}`, user);
}

export const TransferPage = (user: User, error?: string) => Layout("Transfer", `<div class="max-w-md mx-auto glass p-8 rounded-2xl border border-blue-500/30"><h1 class="text-2xl font-bold text-white mb-6 flex items-center gap-2"><svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg> Transfer Money</h1>${error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg mb-4 text-sm text-center">${error}</div>` : ''}<form method="POST" action="/transfer" class="space-y-4"><div><label class="block text-sm font-medium text-slate-400 mb-1">Recipient Username</label><input type="text" name="receiver" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter username"></div><div><label class="block text-sm font-medium text-slate-400 mb-1">Amount (Ks)</label><input type="number" name="amount" min="500" max="50000" required class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Min: 500 - Max: 50,000"></div><div class="text-xs text-slate-500 bg-slate-800 p-3 rounded border border-slate-700"><p>ℹ️ <strong>Rules:</strong></p><ul class="list-disc pl-4 mt-1 space-y-1"><li>Min: 500 Ks | Max: 50,000 Ks</li><li>If both users > 30 days: <strong>Free</strong></li><li>If any user < 30 days: <strong>50 Ks Fee</strong></li></ul></div><button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg">Confirm Transfer</button></form><div class="mt-4 text-center"><a href="/profile" class="text-slate-500 hover:text-white text-sm">Cancel</a></div></div>`, user);

export const AdminUserTable = (usersHtml: string, nextCursor: string | null) => `<div class="glass rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-3">User</th><th class="p-3 text-right">Balance</th><th class="p-3 text-center">Status</th><th class="p-3 text-center">Action</th></tr></thead><tbody class="divide-y divide-slate-700">${usersHtml}</tbody></table></div><div class="p-3 border-t border-slate-700 flex justify-between text-sm">${nextCursor ? `<a href="/admin?user_cursor=${nextCursor}" class="text-blue-400 hover:underline">Next Page →</a>` : '<span class="text-slate-600">End of list</span>'}</div></div>`;

export const AdminSalesTable = (sales: GlobalSale[], nextCursor: string | null) => { let rows = sales.map(s => `<tr class="border-b border-slate-700 hover:bg-slate-800/50 text-sm"><td class="p-3 text-slate-400">${new Date(s.date).toLocaleString("en-US", { timeZone: "Asia/Yangon" })}</td><td class="p-3 text-white font-bold">${s.username}</td><td class="p-3">${s.itemName}</td><td class="p-3 text-green-400">${s.amount}</td><td class="p-3">${s.refunded ? '<span class="text-red-500 text-xs font-bold">REFUNDED</span>' : `<form action="/admin/refund" method="POST" onsubmit="return confirm('Refund ${s.username}?')"><input type="hidden" name="username" value="${s.username}"><input type="hidden" name="date" value="${s.date}"><input type="hidden" name="id" value="${s.id}"><button class="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded">Refund</button></form>`}</td></tr>`).join(""); if(sales.length === 0) rows = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No recent sales.</td></tr>`; return `<div class="glass rounded-xl overflow-hidden mt-6"><div class="px-6 py-4 border-b border-slate-700"><h3 class="text-lg font-bold text-white">🛒 Recent Sales Log</h3></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-3">Date</th><th class="p-3">User</th><th class="p-3">Item</th><th class="p-3">Price</th><th class="p-3">Action</th></tr></thead><tbody class="divide-y divide-slate-700">${rows}</tbody></table></div>${nextCursor ? `<div class="p-3 text-center border-t border-slate-700"><a href="/admin?sale_cursor=${nextCursor}" class="text-blue-400 hover:underline">Load More Sales</a></div>` : ''}</div>`; }
