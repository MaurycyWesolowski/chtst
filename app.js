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

// HTML Elements
const actionBtn = document.getElementById('action-btn');
const messageArea = document.getElementById('message-area');

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
});
updatePawelUI(); // Init

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
    const files = Object.keys(zip.files).filter(n => n.endsWith('.txt'));

    // Odczyt po migracji na chmurę zamiast localStorage
    const parsed = await loadProgressFromCloud();
    let tempArray = [];

    if (parsed && typeof parsed === 'object' && parsed.stats !== undefined && parsed.data !== undefined) {
        tempArray = Array.isArray(parsed.data) ? parsed.data : Object.values(parsed.data);
        stats = parsed.stats;
        shuffle(tempArray); // Zapewnia brak monotonii! Losuje pozostale po restarcie.
        console.log("Przywrócono zapisany postęp z CHMURY dla bazy: " + currentDB);
    } else {
        // Jeśli nie ma w chmurze, inicjuj na nowo
        for (let name of files) {
            const content = await zip.files[name].async("string");
            let q = parseV3(content);
            q.idParam = name;
            q.currentMastery = 0;
            q.requiredMastery = 2;
            q.totalErrors = 0;
            tempArray.push(q);
        }
        shuffle(tempArray);
        stats = { correct: 0, wrong: 0, mastered: 0 };
    }

    quizData = tempArray;

    // Przeskakuj wymaksowane
    currentIndex = 0;
    while (currentIndex < quizData.length && quizData[currentIndex].currentMastery >= quizData[currentIndex].requiredMastery && stats.mastered < quizData.length) {
        currentIndex++;
    }
    if (currentIndex >= quizData.length) currentIndex = 0;

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
    return {
        type: lines.find(l => l.startsWith('TYP:'))?.split(': ')[1] || "ABCD",
        nr: lines.find(l => l.startsWith('NR:'))?.split(': ')[1] || "?",
        content: lines.find(l => l.startsWith('PYTANIE:'))?.replace('PYTANIE: ', ''),
        options: lines.slice(lines.indexOf('TRESC:') + 1),
        correctIndices: lines[0].substring(1).split('').map((v, i) => v === '1' ? i : null).filter(v => v !== null),
        lukiAnswers: lines.includes('LUKI_ANSWERS:')
            ? lines.slice(lines.indexOf('LUKI_ANSWERS:') + 1, lines.indexOf('TRESC:'))
            : []
    };
}

function render() {
    const q = quizData[currentIndex];
    isAnswered = false;
    selectedIndices = [];
    messageArea.innerText = "";
    actionBtn.innerText = "Sprawdź";
    actionBtn.className = "w-full bg-orange text-black py-4 rounded-md font-black uppercase text-sm shadow-lg transition-all active:scale-95";

    document.getElementById('question-text').innerText = q.content;
    document.getElementById('type-tag').innerText = q.type;
    document.getElementById('question-nr').innerText = `ID: ${q.nr}`;

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
        q.options.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = "option-btn w-full text-left p-5 rounded-lg border border-zinc-900 bg-zinc-900/30 text-xs font-bold transition-all";
            btn.innerText = opt;
            btn.onclick = () => handleSelect(i, btn);
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

    actionBtn.className = "w-full bg-zinc-100 text-black py-4 rounded-md font-black uppercase text-sm shadow-xl active:scale-95 transition-all";

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

        document.querySelectorAll('.option-btn').forEach((btn, i) => {
            btn.disabled = true;
            const isCorrect = correctArray.includes(i);
            const isSelected = selectedIndices.includes(i);

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
    actionBtn.className = "w-full bg-zinc-100 text-black py-4 rounded-md font-black uppercase text-sm shadow-xl active:scale-95 transition-all";
}

function processLogic(correct) {
    const q = quizData[currentIndex];
    if (correct !== null) {
        if (correct) {
            stats.correct++;
            q.currentMastery++;
            if (q.currentMastery === 2 && q.totalErrors === 0) {
                messageArea.innerText = messageArea.innerText ? `ALE LEKKIE ⚡ | ${messageArea.innerText}` : "ALE LEKKIE ⚡";
                messageArea.className = `mb-4 text-center h-4 text-[10px] font-black uppercase tracking-widest ${isPawelMode ? 'text-fuchsia-500' : 'text-green-500'}`;
            }
            if (q.currentMastery >= q.requiredMastery) stats.mastered++;
        } else {
            stats.wrong++;
            if (q.currentMastery === 1) {
                messageArea.innerText = messageArea.innerText ? `SYZYF 🪨 | ${messageArea.innerText}` : "SYZYF 🪨";
                messageArea.className = `mb-4 text-center h-4 text-[10px] font-black uppercase tracking-widest ${isPawelMode ? 'text-red-500' : 'text-red-500'}`;
            }
            q.totalErrors++;
            q.currentMastery = 0;
            q.requiredMastery++;
        }

        if (currentUser) {
            const payload = { data: quizData, stats: stats };
            set(ref(db, `users/${currentUser.uid}/progress/${currentDB}`), payload)
                .catch(err => console.error("Błąd zapisu do chmury:", err));
        }
    }

    document.getElementById('stat-correct').innerText = stats.correct;
    document.getElementById('stat-wrong').innerText = stats.wrong;
    const p = Math.round((stats.mastered / quizData.length) * 100) || 0;
    document.getElementById('mastery-bar').style.width = `${p}%`;
    document.getElementById('mastery-global').innerText = `${p}%`;
}

function changeQuestion(dir) {
    let next = currentIndex + dir;
    while (next >= 0 && next < quizData.length && quizData[next].currentMastery >= quizData[next].requiredMastery && stats.mastered < quizData.length) {
        next += dir;
    }
    if (next >= 0 && next < quizData.length) {
        currentIndex = next;
        render();
    } else if (stats.mastered >= quizData.length) {
        alert("LEKKO! Opanowałeś wszystkie chrupki! 🐆🧀");
    }
}

document.getElementById('nav-back-btn').addEventListener('click', () => changeQuestion(-1));
document.getElementById('nav-skip-btn').addEventListener('click', () => {
    if (!isAnswered) check(true);
});
