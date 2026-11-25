import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { ref, set, get, child, remove } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Core App State
let quizData = [];
let currentIndex = 0;
let selectedIndices = [];
let stats = { correct: 0, wrong: 0, mastered: 0 };
let isAnswered = false;

let currentUser = null;
let currentDB = "local";
let isPawelMode = localStorage.getItem('pawelMode') === 'true';
let isShuffleAnswers = localStorage.getItem('shuffleAnswers') === 'true';
let genFilter = localStorage.getItem('genFilter') || 'all'; // 'all' | 'nogen' | 'gen'
if (!['all', 'nogen', 'gen'].includes(genFilter)) genFilter = 'all';

// HTML Elements
const actionBtn = document.getElementById('action-btn');
const messageArea = document.getElementById('message-area');
const explanationPanel = document.getElementById('explanation-panel');
const explanationBtn = document.getElementById('explanation-btn');
const explanationBtnLabel = document.getElementById('explanation-btn-label');
const explanationContent = document.getElementById('explanation-content');
const explanationCategory = document.getElementById('explanation-category');
const explanationNr = document.getElementById('explanation-nr');
const explanationCloseBtn = document.getElementById('explanation-close-btn');
let isExplanationOpen = false;

// Auth Form Logic
let isRegisterMode = false;
const authScreen = document.getElementById('auth-screen');
const uploadScreen = document.getElementById('upload-screen');
const lobbyNav = document.getElementById('lobby-nav');

document.getElementById('auth-toggle-btn').addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('auth-title').innerText = isRegisterMode ? "REJESTRACJA" : "LOGOWANIE";
    document.getElementById('auth-action-btn').innerText = isRegisterMode ? "ZAREJESTRUJ KONTO" : "ZALOGUJ SIĘ";
    document.getElementById('auth-toggle-btn').innerText = isRegisterMode ? "Mam już konto. Powrót na logowanie." : "Nie mam konta. Zarejestruj się.";
    document.getElementById('auth-nick').classList.toggle('hidden', !isRegisterMode);
    document.getElementById('auth-msg').innerText = "";
});

document.getElementById('auth-action-btn').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const nick = document.getElementById('auth-nick').value.trim();
    const msg = document.getElementById('auth-msg');
    msg.className = "mt-4 text-xs font-bold text-red-500 min-h-4 tracking-wider";

    if (!email || !pass || (isRegisterMode && !nick)) {
        msg.innerText = "Uzupełnij wszystkie wymagane pola!";
        return;
    }

    try {
        document.getElementById('auth-action-btn').disabled = true;
        msg.innerText = isRegisterMode ? "Rejestrowanie profilu w chmurze..." : "Logowanie do chmury...";
        msg.className = "mt-4 text-xs font-bold text-orange min-h-4 tracking-wider";

        if (isRegisterMode) {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCred.user, { displayName: nick });
            msg.innerText = "Zarejestrowano pomyślnie!";
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
            msg.innerText = "Zalogowano pomyślnie!";
        }
        msg.className = "mt-4 text-xs font-bold text-green-500 min-h-4 tracking-wider";
    } catch (err) {
        console.error(err);
        if (err.code === 'auth/invalid-email') msg.innerText = "Zły format adresu e-mail.";
        else if (err.code === 'auth/invalid-credential') msg.innerText = "Błędny email lub hasło.";
        else if (err.code === 'auth/email-already-in-use') msg.innerText = "Taki adres email jest w użyciu!";
        else msg.innerText = "Błąd: " + err.message;
        msg.className = "mt-4 text-xs font-bold text-red-500 min-h-4 tracking-wider";
        document.getElementById('auth-action-btn').disabled = false;
    }
});

document.getElementById('auth-google-btn').addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    const msg = document.getElementById('auth-msg');
    msg.className = "mt-4 text-xs font-bold text-orange min-h-4 tracking-wider";
    msg.innerText = "Logowanie do chmury Google...";
    try {
        await signInWithPopup(auth, provider);
        msg.innerText = "Zalogowano Google pomyślnie!";
        msg.className = "mt-4 text-xs font-bold text-green-500 min-h-4 tracking-wider";
    } catch (err) {
        console.error(err);
        msg.innerText = "Błąd Google: " + err.message;
        msg.className = "mt-4 text-xs font-bold text-red-500 min-h-4 tracking-wider";
    }
});

// Listen for Authentication state changes
onAuthStateChanged(auth, (user) => {
    document.getElementById('auth-action-btn').disabled = false;
    if (user) {
        currentUser = user;
        authScreen.classList.add('hidden');
        uploadScreen.classList.remove('hidden');
        lobbyNav.classList.remove('hidden');
        document.getElementById('auth-msg').innerText = "";
        fetchLibrary();
    } else {
        currentUser = null;
        // Wylogowany lub odświeżono bez sesji
        authScreen.classList.remove('hidden');
        uploadScreen.classList.add('hidden');
        lobbyNav.classList.add('hidden');
        document.getElementById('quiz-ui').classList.add('hidden');
        document.getElementById('question-screen').classList.add('hidden');
        document.getElementById('nav-controls').classList.add('hidden');
        setExplanationOpen(false);
        const genBtnEl = document.getElementById('gen-filter-btn');
        if (genBtnEl) genBtnEl.classList.add('hidden');
        const nameTag = document.getElementById('student-name-tag');
        if (nameTag) nameTag.classList.add('hidden');
    }
});

// Wylogowanie
document.getElementById('nav-logout-btn').addEventListener('click', () => signOut(auth));
document.getElementById('lobby-logout-btn').addEventListener('click', () => signOut(auth));

async function fetchLibrary() {
    if (!currentUser) return;
    try {
        const snap = await get(child(ref(db), `users/${currentUser.uid}/unlockedBases`));
        const libSection = document.getElementById('library-section');
        const libGrid = document.getElementById('library-grid');
        libGrid.innerHTML = '';

        if (snap.exists() && Object.keys(snap.val()).length > 0) {
            libSection.classList.remove('hidden');
            const data = snap.val();
            let count = 0;
            for (let [dbKey, info] of Object.entries(data)) {
                count++;
                const itemDiv = document.createElement('div');
                itemDiv.className = "flex items-center gap-2 w-full";
                
                const btn = document.createElement('button');
                btn.className = "flex-grow flex items-center justify-between bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl hover:border-orange transition-all group hover:bg-zinc-800 text-left cursor-pointer";
                btn.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="text-2xl opacity-60 group-hover:opacity-100 transition-all">📚</span>
                        <span class="font-bold text-sm text-zinc-300 group-hover:text-orange transition-all">${info.name || "Baza " + count}</span>
                    </div>
                    <span class="text-sm uppercase font-black group-hover:text-orange transition-all">➡️</span>
                `;
                btn.onclick = () => {
                    document.getElementById('pass-input').value = info.password;
                    document.getElementById('login-btn').click();
                };
                
                const delBtn = document.createElement('button');
                delBtn.className = "bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl text-zinc-500 hover:bg-red-900/20 hover:text-red-500 hover:border-red-500 transition-all text-xl cursor-pointer flex items-center justify-center";
                delBtn.title = "Usuń bazę";
                delBtn.innerHTML = "🗑️";
                delBtn.onclick = async () => {
                    if(confirm("Na pewno chcesz trwale usunąć tę bazę z biblioteki? Twój postęp pozostanie nienaruszony, ale musisz znowu wpisywać hasło żeby się do niego dostać.")) {
                        try {
                            await remove(child(ref(db), `users/${currentUser.uid}/unlockedBases/${dbKey}`));
                            fetchLibrary();
                        } catch(e) {
                            console.error(e);
                        }
                    }
                };
                
                itemDiv.appendChild(btn);
                itemDiv.appendChild(delBtn);
                libGrid.appendChild(itemDiv);
            }
        } else {
            libSection.classList.add('hidden');
        }
    } catch (e) {
        console.error("Library fetch error", e);
    }
}

// Reset i Pawel Mode
document.getElementById('nav-reset-btn').addEventListener('click', async () => {
    if (!currentUser || !currentDB || currentDB === 'local') return;
    if (confirm("Czy na pewno chcesz zresetować CZYSTO DO ZERA cały swój postęp (" + currentDB + ") w chmurze?\nTej akcji nie da się cofnąć!")) {
        try {
            await remove(ref(db, `users/${currentUser.uid}/progress/${currentDB}`));
            alert("Baza wyszorowana z sukcesem! Zaczniesz z czystym kontem.");
            location.reload();
        } catch (err) {
            alert("Błąd: " + err.message);
        }
    }
});

const genFilterBtn = document.getElementById('gen-filter-btn');
function isGenQuestion(q) {
    if (!q || !q.content) return false;
    return /^\s*\(gen\)/i.test(q.content);
}
function hasGenSplit() {
    return quizData && quizData.some(isGenQuestion) && quizData.some(q => !isGenQuestion(q));
}
function matchesGenFilter(q) {
    if (!hasGenSplit() || genFilter === 'all') return true;
    return genFilter === 'gen' ? isGenQuestion(q) : !isGenQuestion(q);
}
function updateGenFilterUI() {
    if (!genFilterBtn) return;
    if (!hasGenSplit()) {
        genFilterBtn.classList.add('hidden');
        return;
    }
    genFilterBtn.classList.remove('hidden');
    const base = "flex items-center px-3 py-1.5 rounded-full transition-all text-[9px] font-black mr-1 uppercase tracking-widest cursor-pointer border";
    if (genFilter === 'nogen') {
        genFilterBtn.innerText = "🎯 BEZ GEN";
        genFilterBtn.className = `${base} bg-orange/15 border-orange text-orange`;
    } else if (genFilter === 'gen') {
        genFilterBtn.innerText = "🤖 TYLKO GEN";
        genFilterBtn.className = `${base} bg-purple-900/30 border-purple-400 text-purple-300`;
    } else {
        genFilterBtn.innerText = "📚 WSZYSTKIE";
        genFilterBtn.className = `${base} bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-orange`;
    }
}
function findFirstMatchingIndex(startIdx = 0, dir = 1) {
    if (!quizData || quizData.length === 0) return -1;
    const total = quizData.length;
    const step = dir >= 0 ? 1 : -1;
    let idx = ((startIdx % total) + total) % total;
    for (let checked = 0; checked < total; checked++) {
        const item = quizData[idx];
        if (matchesGenFilter(item) && item.currentMastery < item.requiredMastery) {
            return idx;
        }
        idx = (idx + step + total) % total;
    }
    return -1;
}
if (genFilterBtn) {
    genFilterBtn.addEventListener('click', () => {
        const order = ['all', 'nogen', 'gen'];
        genFilter = order[(order.indexOf(genFilter) + 1) % order.length];
        localStorage.setItem('genFilter', genFilter);
        updateGenFilterUI();
        if (quizData && quizData.length > 0) {
            const nextIdx = matchesGenFilter(quizData[currentIndex]) && quizData[currentIndex].currentMastery < quizData[currentIndex].requiredMastery
                ? currentIndex
                : findFirstMatchingIndex(0, 1);
            if (nextIdx !== -1) {
                currentIndex = nextIdx;
                processLogic(null);
                render();
            } else {
                const fallbackIdx = quizData.findIndex(matchesGenFilter);
                if (fallbackIdx !== -1) currentIndex = fallbackIdx;
                processLogic(null);
                render();
                alert("LEKKO! Opanowałeś już wszystkie pytania w tej grupie! 🐆🧀");
            }
        }
    });
}

const shuffleBtn = document.getElementById('shuffle-answers-btn');
function updateShuffleUI() {
    shuffleBtn.classList.toggle('border-orange', isShuffleAnswers);
    shuffleBtn.classList.toggle('text-orange', isShuffleAnswers);
    shuffleBtn.classList.toggle('text-zinc-500', !isShuffleAnswers);
    shuffleBtn.classList.toggle('border-zinc-800', !isShuffleAnswers);
}
if(shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        isShuffleAnswers = !isShuffleAnswers;
        localStorage.setItem('shuffleAnswers', isShuffleAnswers);
        updateShuffleUI();
        if (typeof render === 'function' && !isAnswered && quizData && quizData.length > 0) render();
    });
    updateShuffleUI();
}

const pawelBtn = document.getElementById('pawel-mode-btn');
function updatePawelUI() {
    pawelBtn.classList.toggle('border-cyan-400', isPawelMode);
    pawelBtn.classList.toggle('bg-cyan-900/20', isPawelMode);
    pawelBtn.classList.toggle('text-cyan-400', isPawelMode);
    pawelBtn.classList.toggle('text-zinc-500', !isPawelMode);
    pawelBtn.classList.toggle('border-zinc-800', !isPawelMode);
}
pawelBtn.addEventListener('click', () => {
    isPawelMode = !isPawelMode;
    localStorage.setItem('pawelMode', isPawelMode);
    updatePawelUI();
    if (quizData && quizData[currentIndex]) {
        refreshExplanationTheme(quizData[currentIndex]);
    }
});
updatePawelUI(); // Init

// Obsługa panelu Wyjaśnienia
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatExplanation(rawText) {
    if (!rawText) return '';
    const accentCode = isPawelMode
        ? 'text-cyan-400 border-cyan-900/50 bg-cyan-950/30'
        : 'text-orange border-zinc-800 bg-zinc-900';

    const applyInline = (line) => {
        let html = escapeHtml(line);
        html = html.replace(/`([^`]+)`/g, `<code class="px-1.5 py-0.5 rounded border font-mono text-xs ${accentCode}">$1</code>`);
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-zinc-100 font-bold">$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em class="text-zinc-400 italic">$1</em>');
        return html;
    };

    const blocks = String(rawText).trim().split(/\n\s*\n/);
    return blocks.map(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const isList = lines.length > 0 && lines.every(l => /^[-•*]\s+/.test(l));
        if (isList) {
            const items = lines.map(l => `<li class="pl-1">${applyInline(l.replace(/^[-•*]\s+/, ''))}</li>`).join('');
            return `<ul class="list-disc list-inside space-y-1.5 text-zinc-300">${items}</ul>`;
        }
        return `<p class="leading-relaxed">${lines.map(applyInline).join('<br>')}</p>`;
    }).join('');
}

function refreshExplanationTheme(q) {
    if (!explanationPanel || !explanationBtn) return;
    if (isPawelMode) {
        explanationPanel.classList.remove('border-orange/30', 'orange-glow');
        explanationPanel.classList.add('border-cyan-400/40', 'shadow-[0_0_25px_rgba(34,211,238,0.12)]');
    } else {
        explanationPanel.classList.remove('border-cyan-400/40', 'shadow-[0_0_25px_rgba(34,211,238,0.12)]');
        explanationPanel.classList.add('border-orange/30', 'orange-glow');
    }
    const titleEl = explanationPanel.querySelector('h3');
    if (titleEl) {
        titleEl.className = `text-xs font-black uppercase tracking-widest ${isPawelMode ? 'text-cyan-400' : 'text-orange'}`;
    }
    if (q && q.explanation && explanationContent) {
        explanationContent.innerHTML = formatExplanation(q.explanation);
    }
    updateExplanationBtnStyle();
}

function updateExplanationBtnStyle() {
    if (!explanationBtn) return;
    const base = "w-full mb-3 border py-2.5 px-4 rounded-md font-bold uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer";
    const hiddenClass = explanationBtn.classList.contains('hidden') ? ' hidden' : '';
    if (isExplanationOpen) {
        explanationBtn.className = isPawelMode
            ? `${base} border-cyan-400 bg-cyan-950/30 text-cyan-300${hiddenClass}`
            : `${base} border-orange bg-orange/10 text-orange${hiddenClass}`;
        if (explanationBtnLabel) explanationBtnLabel.innerText = "Ukryj wyjaśnienie";
    } else {
        explanationBtn.className = isPawelMode
            ? `${base} border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-cyan-400 hover:text-cyan-400${hiddenClass}`
            : `${base} border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-orange hover:text-orange${hiddenClass}`;
        if (explanationBtnLabel) explanationBtnLabel.innerText = "Wyjaśnienie";
    }
}

function setExplanationOpen(open) {
    isExplanationOpen = Boolean(open);
    if (!explanationPanel) return;
    explanationPanel.classList.toggle('hidden', !isExplanationOpen);
    updateExplanationBtnStyle();
}

if (explanationBtn) {
    explanationBtn.addEventListener('click', () => {
        const q = quizData[currentIndex];
        if (!q || !q.explanation) return;
        setExplanationOpen(!isExplanationOpen);
    });
}
if (explanationCloseBtn) {
    explanationCloseBtn.addEventListener('click', () => setExplanationOpen(false));
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isExplanationOpen) setExplanationOpen(false);
});

// Dekonstrukcja Bazy Ograniczonej z Githuba
document.getElementById('login-btn').addEventListener('click', async () => {
    const pass = document.getElementById('pass-input').value.trim();
    const status = document.getElementById('auth-status');

    if (!pass) {
        status.innerText = "Wpisz hasło/kod bazy!";
        status.className = "mt-4 text-xs font-bold text-red-500 min-h-4 tracking-wider";
        return;
    }

    status.innerText = "Autoryzuję i ładuję repozytorium... 🕵️‍♂️";
    status.className = "mt-4 text-xs font-bold text-orange min-h-4 tracking-wider";
    document.getElementById('login-btn').disabled = true;

    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

        const response = await fetch(`${hashHex}.enc`);
        if (!response.ok) {
            const fallbackZip = await fetch(`${pass}.zip`);
            if (!fallbackZip.ok) throw new Error("Błąd: Nie odnaleziono bazy o tym haśle/nazwie (Brak pliku na serwerze)!");

            const blob = await fallbackZip.blob();
            currentDB = hashHex || pass.replace(/[.#$\[\]]/g, '_');
            await processZipBlob(blob);
        } else {
            const encryptedBuffer = await response.arrayBuffer();
            const encryptedData = new Uint8Array(encryptedBuffer);

            if (encryptedData.length < 28) throw new Error("Plik jest uszkodzony.");

            const salt = encryptedData.slice(0, 16);
            const iv = encryptedData.slice(16, 28);
            const payload = encryptedData.slice(28);

            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                "raw", enc.encode(pass), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
            );
            const key = await crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
                keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
            );

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv }, key, payload
            );

            const decryptedBlob = new Blob([decryptedBuffer], { type: "application/zip" });

            currentDB = hashHex || pass.replace(/[.#$\[\]]/g, '_');
            await processZipBlob(decryptedBlob);
        }

        status.innerText = "Udało się! Inicjowanie środowiska...";
        status.className = "mt-4 text-xs font-bold text-green-500 min-h-4 tracking-wider";
        document.getElementById('login-btn').disabled = false;

        const safeKey = hashHex || pass.replace(/[.#$\[\]]/g, '_');
        const libRef = child(ref(db), `users/${currentUser.uid}/unlockedBases/${safeKey}`);
        const snap = await get(libRef);
        if (!snap.exists()) {
            setTimeout(() => {
                let customName = prompt(`🔐 Baza pomyślnie odblokowana!\nNadaj dumną nazwę dla tej skrytki by zapisała się w Twojej Bibliotece w chmurze:`, `Prywatna Baza`);
                if (customName) {
                    set(libRef, {
                        name: customName,
                        password: pass,
                        timestamp: Date.now()
                    }).then(() => fetchLibrary());
                }
            }, 500);
        }

    } catch (err) {
        console.error(err);
        if (err.name === "OperationError") {
            status.innerText = "Odmowa Dostępu: Błędne Kod/Hasło bazy!";
        } else {
            status.innerText = err.message;
        }
        status.className = "mt-4 text-xs font-bold text-red-500 min-h-4 tracking-wider";
        document.getElementById('login-btn').disabled = false;
    }
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentDB = file.name.replace('.zip', ''); // fallback nazwa bazy jako nazwa zipa
    await processZipBlob(file);
});

// Utils
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function loadProgressFromCloud() {
    if (!currentUser) return null;
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `users/${currentUser.uid}/progress/${currentDB}`));
        if (snapshot.exists()) {
            return snapshot.val();
        }
    } catch (error) {
        console.error("Błąd pobrania bazy Realtime Database", error);
    }
    return null;
}

async function processZipBlob(fileOrBlob) {
    const zip = await JSZip.loadAsync(fileOrBlob);
    const txtFiles = Object.keys(zip.files).filter(n => n.endsWith('.txt'));
    const jsonFiles = Object.keys(zip.files).filter(n => n.endsWith('.json'));

    if (txtFiles.length === 0 && jsonFiles.length === 0) {
        alert("BŁĄD: Baza jest pusta lub w złym formacie! ZIP musi zawierać pliki .txt lub .json.");
        document.getElementById('upload-screen').classList.remove('hidden');
        document.getElementById('quiz-ui').classList.add('hidden');
        return;
    }

    // Odczyt po migracji na chmurę zamiast localStorage
    const parsed = await loadProgressFromCloud();
    let tempArray = [];
    let cloudValid = false;

    if (parsed && typeof parsed === 'object' && parsed.stats !== undefined && parsed.data !== undefined) {
        let checkArray = Array.isArray(parsed.data) ? parsed.data : Object.values(parsed.data);
        if (checkArray.length > 0) {
            let dbReplaced = false;
            // Jeśli w aktualnym pliku ZIP są pliki JSON, sprawdź czy baza nie została podmieniona oraz zsynchronizuj treści/wyjaśnienia
            if (jsonFiles.length > 0) {
                const metaByNr = {};
                let totalFreshCount = 0;
                for (let name of jsonFiles) {
                    const content = await zip.files[name].async("string");
                    const parsedJson = JSON.parse(content);
                    totalFreshCount += parsedJson.length;
                    parsedJson.forEach(item => {
                        if (item.nr !== undefined) {
                            let freshCorrect = null;
                            if (Array.isArray(item.opcje) && item.opcje.length > 0 && typeof item.odpowiedz === 'string') {
                                const isMulti = (item.pytanie || '').toLowerCase().includes('(wybór wielokrotny)');
                                const isLuki = (item.pytanie || '').toLowerCase().includes('(luki)');
                                if (!isLuki) {
                                    freshCorrect = [];
                                    if (isMulti) {
                                        const arr = item.odpowiedz.split(';').map(s => s.trim().toLowerCase());
                                        item.opcje.forEach((opt, idx) => {
                                            if (arr.includes(opt.trim().toLowerCase())) freshCorrect.push(idx);
                                        });
                                    } else {
                                        const ans = item.odpowiedz.trim().toLowerCase();
                                        item.opcje.forEach((opt, idx) => {
                                            if (opt.trim().toLowerCase() === ans) freshCorrect.push(idx);
                                        });
                                    }
                                }
                            }
                            metaByNr[item.nr.toString()] = {
                                content: item.pytanie || "",
                                explanation: item.wyjasnienie || item.explanation || "",
                                category: item.kategoria || item.dzial || "",
                                correctIndices: freshCorrect
                            };
                        }
                    });
                }
                const matchedCount = checkArray.filter(q => metaByNr[String(q.nr)]).length;
                if (matchedCount === 0 || checkArray.length !== totalFreshCount) {
                    console.log("Wykryto nową wersję bazy (inna liczba lub ID pytań) — ładuję świeżą bazę z pliku.");
                    dbReplaced = true;
                } else {
                    checkArray.forEach(q => {
                        const meta = metaByNr[String(q.nr)];
                        if (meta) {
                            if (meta.content) q.content = meta.content;
                            if (meta.explanation) q.explanation = meta.explanation;
                            if (meta.category) q.category = meta.category;
                            if (meta.correctIndices && meta.correctIndices.length > 0 && q.type !== 'OPEN' && q.type !== 'LUKI') {
                                const oldArr = Array.isArray(q.correctIndices) ? [...q.correctIndices].sort() : Object.values(q.correctIndices || {}).sort();
                                const newArr = [...meta.correctIndices].sort();
                                if (JSON.stringify(oldArr) !== JSON.stringify(newArr)) {
                                    q.correctIndices = meta.correctIndices;
                                    q.currentMastery = 0; // reset mastery tylko dla pytania, któremu zmieniono klucz
                                }
                            }
                        }
                    });
                }
            }
            if (!dbReplaced) {
                tempArray = checkArray;
                stats = parsed.stats;
                shuffle(tempArray); // Zapewnia brak monotonii! Losuje pozostale po restarcie.
                console.log("Przywrócono zapisany postęp z CHMURY dla bazy: " + currentDB);
                cloudValid = true;
            }
        }
    }

    if (!cloudValid) {
        // Jeśli nie ma w chmurze lub jest pusty, inicjuj na nowo
        if (jsonFiles.length > 0) {
            for (let name of jsonFiles) {
                const content = await zip.files[name].async("string");
                const parsedJson = JSON.parse(content);
                parsedJson.forEach(item => {
                    let type = "ABCD";
                    if (!item.opcje || item.opcje.length === 0) type = "OPEN";
                    else if (item.pytanie.toLowerCase().includes('(luki)')) type = "LUKI";
                    else if (item.pytanie.toLowerCase().includes('(wybór wielokrotny)')) type = "MULTI";

                    let q = {
                        idParam: item.nr.toString(),
                        nr: item.nr.toString(),
                        content: item.pytanie,
                        options: item.opcje || [],
                        explanation: item.wyjasnienie || item.explanation || "",
                        category: item.kategoria || item.dzial || "",
                        currentMastery: 0,
                        requiredMastery: 2,
                        totalErrors: 0,
                        type: type
                    };

                    if (type === "OPEN") {
                        q.options = [item.odpowiedz];
                    } else if (type === "LUKI") {
                        q.lukiAnswers = item.odpowiedz.split(';').map(s => s.trim());
                        const correctVals = q.lukiAnswers.map(s => {
                            let parts = s.split(':');
                            return parts.length > 1 ? parts.slice(1).join(':').trim() : s;
                        });
                        q.options = [...(item.opcje || []), ...correctVals];
                        q.options = [...new Set(q.options)]; // usuniecie duplikatow
                        shuffle(q.options);
                    } else if (type === "MULTI") {
                        const correctAnsArray = item.odpowiedz.split(';').map(s => s.trim().toLowerCase());
                        q.correctIndices = [];
                        q.options.forEach((opt, idx) => {
                            if (correctAnsArray.includes(opt.trim().toLowerCase())) q.correctIndices.push(idx);
                        });
                    } else {
                        q.correctIndices = [];
                        q.options.forEach((opt, idx) => {
                            if (opt.trim().toLowerCase() === item.odpowiedz.trim().toLowerCase()) q.correctIndices.push(idx);
                        });
                    }
                    tempArray.push(q);
                });
            }
        } else {
            for (let name of txtFiles) {
                const content = await zip.files[name].async("string");
                let q = parseV3(content);
                q.idParam = name;
                q.currentMastery = 0;
                q.requiredMastery = 2;
                q.totalErrors = 0;
                tempArray.push(q);
            }
        }
        shuffle(tempArray);
        stats = { correct: 0, wrong: 0, mastered: 0 };
    }

    quizData = tempArray;

    if (quizData.length === 0) {
        alert("BŁĄD: Wygenerowana baza pytań jest pusta! Skontaktuj się z administratorem.");
        document.getElementById('upload-screen').classList.remove('hidden');
        document.getElementById('quiz-ui').classList.add('hidden');
        return;
    }

    // Ustaw widoczność przycisku filtra GEN i znajdź pierwsze pasujące nieopanowane pytanie
    updateGenFilterUI();
    const firstIdx = findFirstMatchingIndex(0, 1);
    if (firstIdx !== -1) {
        currentIndex = firstIdx;
    } else {
        const fallbackIdx = quizData.findIndex(matchesGenFilter);
        currentIndex = fallbackIdx !== -1 ? fallbackIdx : 0;
    }

    // Przełączanie Okiem
    document.getElementById('upload-screen').classList.add('hidden');
    lobbyNav.classList.add('hidden');
    document.getElementById('quiz-ui').classList.remove('hidden');
    document.getElementById('question-screen').classList.remove('hidden');
    document.getElementById('nav-controls').classList.remove('hidden');

    // Info panel
    const n = currentUser?.displayName || currentUser?.email || "Gość";
    const nameTag = document.getElementById('student-name-tag');
    if (nameTag) {
        nameTag.innerText = `🎓 ${n}`;
        nameTag.classList.remove('hidden');
    }

    processLogic(null);
    render();
}

function parseV3(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const trescIdx = lines.indexOf('TRESC:');
    const wyjIdx = lines.indexOf('WYJASNIENIE:');
    const optionsEnd = wyjIdx > trescIdx ? wyjIdx : lines.length;
    return {
        type: lines.find(l => l.startsWith('TYP:'))?.split(': ')[1] || "ABCD",
        nr: lines.find(l => l.startsWith('NR:'))?.split(': ')[1] || "?",
        content: lines.find(l => l.startsWith('PYTANIE:'))?.replace('PYTANIE: ', ''),
        options: trescIdx !== -1 ? lines.slice(trescIdx + 1, optionsEnd) : [],
        explanation: wyjIdx !== -1 ? lines.slice(wyjIdx + 1).join('\n') : "",
        category: lines.find(l => l.startsWith('KATEGORIA:'))?.replace('KATEGORIA: ', '') || "",
        correctIndices: lines[0].substring(1).split('').map((v, i) => v === '1' ? i : null).filter(v => v !== null),
        lukiAnswers: lines.includes('LUKI_ANSWERS:')
            ? lines.slice(lines.indexOf('LUKI_ANSWERS:') + 1, trescIdx)
            : []
    };
}

function render() {
    if (!quizData || quizData.length === 0) return;
    const q = quizData[currentIndex];
    if (!q) return;
    isAnswered = false;
    selectedIndices = [];
    messageArea.innerText = "";
    actionBtn.innerText = "Sprawdź";
    actionBtn.className = "w-full bg-orange text-black py-4 rounded-md font-black uppercase text-sm shadow-lg transition-all active:opacity-80";

    document.getElementById('question-text').innerText = q.content;
    document.getElementById('type-tag').innerText = q.type;
    document.getElementById('question-nr').innerText = `ID: ${q.nr}`;

    // Reset i przygotowanie panelu Wyjaśnienia
    setExplanationOpen(false);
    if (explanationBtn) {
        const hasExplanation = Boolean(q.explanation && q.explanation.trim().length > 0);
        explanationBtn.classList.toggle('hidden', !hasExplanation);
        if (hasExplanation) {
            if (explanationNr) explanationNr.innerText = `ID: ${q.nr}`;
            if (explanationCategory) {
                if (q.category && q.category.trim().length > 0) {
                    explanationCategory.innerText = q.category;
                    explanationCategory.classList.remove('hidden');
                } else {
                    explanationCategory.classList.add('hidden');
                }
            }
            refreshExplanationTheme(q);
        }
    }

    const dots = document.getElementById('mastery-dots');
    dots.innerHTML = '';
    for (let i = 0; i < q.requiredMastery; i++) {
        const d = document.createElement('div');
        d.className = `w-1.5 h-1.5 rounded-full ${i < q.currentMastery ? 'bg-orange shadow-[0_0_5px_#FF6B00]' : 'bg-zinc-800'}`;
        dots.appendChild(d);
    }

    const grid = document.getElementById('options-grid');
    const openArea = document.getElementById('open-area');
    grid.innerHTML = ''; grid.classList.add('hidden'); openArea.classList.add('hidden');

    if (q.type === 'OPEN') {
        openArea.classList.remove('hidden');
        document.getElementById('answer-input').value = '';
        document.getElementById('answer-input').disabled = false;
        document.getElementById('answer-input').className = "w-full p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white font-bold outline-none focus:border-orange transition-all";
    } else if (q.type === 'LUKI') {
        let modifiedContent = q.content;
        let optionsHTML = `<option value="">-- wybierz --</option>`;
        q.options.forEach((opt, i) => {
            optionsHTML += `<option value="${opt.replace(/"/g, '&quot;')}">${opt}</option>`;
        });

        let foundMarkers = false;
        modifiedContent = modifiedContent.replace(/\(Odpowied[zźż]\s*:?\s*([a-zA-Z0-9]+)\)/gi, (match, p1) => {
            foundMarkers = true;
            return `<select id="luka-${p1}" class="luka-select p-2 mx-1 mt-2 rounded bg-zinc-900 border border-orange text-white font-bold outline-none focus:border-green-500 transition-all text-[0.85rem] appearance-none cursor-pointer">${optionsHTML}</select>`;
        });

        if (!foundMarkers && q.lukiAnswers && q.lukiAnswers.length > 0) {
            modifiedContent += `<div class="mt-6 flex flex-col gap-3">`;
            q.lukiAnswers.forEach(ans => {
                let parts = ans.split(':');
                let id = parts[0].trim();
                modifiedContent += `<div class="flex items-center justify-between bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800">
                    <span class="text-[0.65rem] font-black text-zinc-500 uppercase">LUKA ${id}</span>
                    <select id="luka-${id}" class="luka-select p-3 w-[75%] rounded-xl bg-zinc-950 border border-orange text-white font-bold outline-none focus:border-green-500 transition-all text-[0.8rem] appearance-none cursor-pointer">${optionsHTML}</select>
                </div>`;
            });
            modifiedContent += `</div>`;
        }

        document.getElementById('question-text').innerHTML = modifiedContent;
    } else {
        grid.classList.remove('hidden');
        let displayIndices = q.options.map((_, i) => i);
        if (isShuffleAnswers) shuffle(displayIndices);

        displayIndices.forEach((origIdx) => {
            const opt = q.options[origIdx];
            const btn = document.createElement('button');
            btn.className = "option-btn w-full text-left p-5 rounded-lg border border-zinc-900 bg-zinc-900/30 text-xs font-bold transition-all";
            btn.innerText = opt;
            btn.dataset.origIdx = origIdx;
            btn.onclick = () => handleSelect(origIdx, btn);
            grid.appendChild(btn);
        });
    }

    actionBtn.onclick = () => {
        if (!isAnswered) check(false);
        else changeQuestion(1);
    };
}

function handleSelect(idx, btn) {
    if (isAnswered) return;
    const q = quizData[currentIndex];
    if (q.type === 'MULTI' || q.type === 'LUKI') {
        btn.classList.toggle('selected');
        if (selectedIndices.includes(idx)) selectedIndices = selectedIndices.filter(i => i !== idx);
        else selectedIndices.push(idx);
    } else {
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedIndices = [idx];
    }
}

function check(forceSkip = false) {
    const q = quizData[currentIndex];
    const isLuki = q.type === 'LUKI';
    const lukiSelects = isLuki ? document.querySelectorAll('.luka-select') : [];

    let isSkipped = forceSkip;

    if (!isSkipped) {
        if (q.type !== 'OPEN' && !isLuki && selectedIndices.length === 0) {
            isSkipped = true;
        } else if (isLuki) {
            let allAnswered = true;
            lukiSelects.forEach(s => { if (!s.value) allAnswered = false; });
            if (!allAnswered) isSkipped = true;
        } else if (q.type === 'OPEN') {
            const input = document.getElementById('answer-input');
            if(input.value.trim() === '') isSkipped = true;
        }
    }

    isAnswered = true;
    let isPerfect = false;

    actionBtn.className = "w-full bg-zinc-100 text-black py-4 rounded-md font-black uppercase text-sm shadow-xl active:opacity-80 transition-all";

    if (q.type === 'OPEN') {
        const input = document.getElementById('answer-input');
        let userVal = input.value.trim().toLowerCase().replace(/[.,]+$/, '');
        let expectedVal = q.options[0].trim().toLowerCase().replace(/[.,]+$/, '');
        isPerfect = isSkipped ? false : (userVal === expectedVal);
        input.disabled = true;
        if (!isPerfect) {
            input.className = isPawelMode
                ? "w-full p-5 rounded-lg font-bold transition-all bg-red-900/20 border-2 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                : "w-full p-5 rounded-lg font-bold transition-all bg-red-900/20 border-2 border-red-500 text-red-500";
            messageArea.innerText = `ODPOWIEDŹ: ${q.options[0]}`;
        } else {
            input.className = isPawelMode
                ? "w-full p-5 rounded-lg font-bold transition-all bg-fuchsia-900/20 border-2 border-fuchsia-500 text-fuchsia-500 shadow-[0_0_15px_rgba(217,70,239,0.2)]"
                : "w-full p-5 rounded-lg font-bold transition-all bg-green-900/20 border-2 border-green-500 text-green-500";
        }
    } else if (q.type === 'LUKI') {
        isPerfect = true;
        let correctMap = {};
        if (q.lukiAnswers && q.lukiAnswers.length > 0) {
            q.lukiAnswers.forEach(ans => {
                let parts = ans.split(':');
                if (parts.length > 1) {
                    correctMap[parts[0].trim()] = parts.slice(1).join(':').trim().toLowerCase();
                }
            });
        }

        lukiSelects.forEach(sel => {
            sel.disabled = true;
            let id = sel.id.replace('luka-', '');
            let expected = correctMap[id];
            let userVal = sel.value.trim().toLowerCase();

            sel.classList.remove('border-orange');
            if (!isSkipped && expected && userVal === expected) {
                sel.classList.add(isPawelMode ? 'bg-fuchsia-900/40' : 'bg-green-900/40', isPawelMode ? 'border-fuchsia-500' : 'border-green-500', isPawelMode ? 'text-fuchsia-500' : 'text-green-500');
            } else {
                isPerfect = false;
                sel.classList.add(isPawelMode ? 'bg-red-900/40' : 'bg-red-900/40', isPawelMode ? 'border-red-500' : 'border-red-500', isPawelMode ? 'text-red-500' : 'text-red-500');
                sel.outerHTML += `<span class="${isPawelMode ? 'text-cyan-400' : 'text-green-500'} text-xs ml-1 font-black block mt-1 mb-2">[Poprawna: ${expected || 'Brak danych'}]</span>`;
            }
        });
    } else {
        const correctArray = Array.isArray(q.correctIndices) ? q.correctIndices : Object.values(q.correctIndices);
        const optionsList = Array.isArray(q.options) ? q.options : Object.values(q.options);
        isPerfect = isSkipped ? false : JSON.stringify(selectedIndices.sort()) === JSON.stringify(correctArray.sort());

        document.querySelectorAll('.option-btn').forEach((btn) => {
            const origIdx = parseInt(btn.dataset.origIdx);
            btn.disabled = true;
            const isCorrect = correctArray.includes(origIdx);
            const isSelected = selectedIndices.includes(origIdx);

            if (isCorrect && isSelected) {
                btn.className = isPawelMode
                    ? "option-btn w-full text-left p-5 rounded-lg border-2 border-fuchsia-500 bg-fuchsia-900/20 text-fuchsia-500 font-black shadow-[0_0_15px_rgba(217,70,239,0.2)]"
                    : "option-btn w-full text-left p-5 rounded-lg border-2 border-green-500 bg-green-900/20 text-green-500 font-black";
            } else if (isCorrect && !isSelected) {
                btn.className = isPawelMode
                    ? "option-btn w-full text-left p-5 rounded-lg border-2 border-cyan-400 bg-cyan-900/20 text-cyan-400 font-black shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                    : "option-btn w-full text-left p-5 rounded-lg border-2 border-yellow-500 bg-yellow-900/20 text-yellow-500 font-black";
            } else if (!isCorrect && isSelected) {
                btn.className = isPawelMode
                    ? "option-btn w-full text-left p-5 rounded-lg border-2 border-red-500 bg-red-900/20 text-red-500 font-black shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    : "option-btn w-full text-left p-5 rounded-lg border-2 border-red-500 bg-red-900/20 text-red-500 font-black";
            }
        });
    }

    processLogic(isPerfect);
    actionBtn.innerText = "Następny ➡️";
    actionBtn.className = "w-full bg-zinc-100 text-black py-4 rounded-md font-black uppercase text-sm shadow-xl active:opacity-80 transition-all";
}

function processLogic(correct) {
    const q = quizData[currentIndex];
    if (correct !== null) {
        if (correct) {
            stats.correct++;
            q.currentMastery++;
            if (q.currentMastery === 2 && q.totalErrors === 0) {
                messageArea.innerText = messageArea.innerText ? `ALE LEKKIE ⚡ | ${messageArea.innerText}` : "ALE LEKKIE ⚡";
                messageArea.className = `mb-6 text-center min-h-4 text-[10px] font-black uppercase tracking-widest transition-all ${isPawelMode ? 'text-fuchsia-500' : 'text-green-500'}`;
            }
            stats.mastered = quizData.filter(item => item.currentMastery >= item.requiredMastery).length;
        } else {
            stats.wrong++;
            if (q.currentMastery === 1) {
                messageArea.innerText = messageArea.innerText ? `SYZYF 🪨 | ${messageArea.innerText}` : "SYZYF 🪨";
                messageArea.className = `mb-6 text-center min-h-4 text-[10px] font-black uppercase tracking-widest transition-all ${isPawelMode ? 'text-red-500' : 'text-red-500'}`;
            }
            q.totalErrors++;
            q.currentMastery = 0;
            q.requiredMastery++;
            stats.mastered = quizData.filter(item => item.currentMastery >= item.requiredMastery).length;
        }

        if (currentUser) {
            const payload = { data: quizData, stats: stats };
            set(ref(db, `users/${currentUser.uid}/progress/${currentDB}`), payload)
                .catch(err => console.error("Błąd zapisu do chmury:", err));
        }
    }

    document.getElementById('stat-correct').innerText = stats.correct;
    document.getElementById('stat-wrong').innerText = stats.wrong;
    const activePool = quizData.filter(matchesGenFilter);
    const activeMastered = activePool.filter(item => item.currentMastery >= item.requiredMastery).length;
    const p = Math.round((activeMastered / (activePool.length || 1)) * 100) || 0;
    document.getElementById('mastery-bar').style.width = `${p}%`;
    document.getElementById('mastery-global').innerText = `${p}% (${activeMastered}/${activePool.length})`;
}

function changeQuestion(dir) {
    if (!quizData || quizData.length === 0) return;

    const total = quizData.length;
    stats.mastered = quizData.filter(item => item.currentMastery >= item.requiredMastery).length;

    const activePool = quizData.filter(matchesGenFilter);
    const activeMastered = activePool.filter(item => item.currentMastery >= item.requiredMastery).length;

    if (activePool.length > 0 && activeMastered >= activePool.length) {
        const label = genFilter === 'nogen' ? 'bez GEN' : genFilter === 'gen' ? 'GEN' : 'w bazie';
        alert(`LEKKO! Opanowałeś wszystkie pytania (${label})! 🐆🧀`);
        return;
    }

    const step = dir >= 0 ? 1 : -1;
    const next = findFirstMatchingIndex(currentIndex + step, step);

    if (next !== -1) {
        currentIndex = next;
        render();
    } else {
        alert("LEKKO! Opanowałeś wszystkie chrupki! 🐆🧀");
    }
}

document.getElementById('nav-back-btn').addEventListener('click', () => changeQuestion(-1));
document.getElementById('nav-skip-btn').addEventListener('click', () => {
    if (!isAnswered) check(true);
});
