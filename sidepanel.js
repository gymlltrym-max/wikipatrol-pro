// --- מנגנון בדיקת גרסה אקטיבי (רץ בפתיחת החלונית) ---
(async function checkAppVersion() {
    const VERSION_URL = 'https://raw.githubusercontent.com/gymlltrym-max/wikipatrol-pro/refs/heads/main/version.json';
    
    try {
        // 1. משיכת הגרסה הנוכחית מהמניפסט
        const currentVersion = chrome.runtime.getManifest().version;
        
        // 2. בדיקה מול GitHub (עם timestamp למניעת cache)
        const response = await fetch(VERSION_URL + '?t=' + Date.now());
        if (!response.ok) return; // אם אין אינטרנט או שגיאה, מתעלמים
        
        const data = await response.json();
        
        let status = 'OK';
        
        // פונקציית השוואת גרסאות
        const compare = (v1, v2) => v1.localeCompare(v2, undefined, { numeric: true, sensitivity: 'base' });

        // לוגיקת הבדיקה
        const isBlocked = data.blocked_versions && data.blocked_versions.includes(currentVersion);
        const isOld = compare(currentVersion, data.min_supported_version) < 0;
        const hasUpdate = compare(currentVersion, data.latest_version) < 0;

        if (isBlocked || isOld) {
            status = 'BLOCK';
        } else if (hasUpdate) {
            status = 'UPDATE_AVAILABLE';
        }

        // 3. הצגת הבאנר אם צריך
        if (status !== 'OK') {
            showUpdateBanner(status, data.download_url, data.latest_version);
        }

    } catch (e) {
        console.error("Version Check Failed:", e);
    }
})();

function showUpdateBanner(status, url, latest) {
    // יצירת שכבת טשטוש
    const blurOverlay = document.createElement('div');
    blurOverlay.id = 'app-blur-overlay';
    blurOverlay.style = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        z-index: 9998; pointer-events: all; background: rgba(0,0,0,0.1);
    `;

    // יצירת הבאנר
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style = `
        background: ${status === 'BLOCK' ? '#d93025' : '#f9ab00'};
        color: white; padding: 15px; text-align: center; font-weight: bold;
        position: sticky; top: 0; z-index: 9999; direction: rtl;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-family: system-ui, sans-serif;
    `;

    banner.innerHTML = `
        <div style="font-size: 15px; margin-bottom: 8px;">
            ${status === 'BLOCK' ? '🛑 הגרסה שברשותך ישנה מדי ואינה נתמכת עוד' : '✨ עדכון זמין: גרסה ' + latest}
        </div>
        <a href="${url}" target="_blank" style="display: inline-block; background: white; color: ${status === 'BLOCK' ? '#d93025' : '#f9ab00'}; padding: 5px 15px; border-radius: 20px; text-decoration: none; font-size: 13px;">לחץ כאן להורדה ועדכון</a>
        ${status !== 'BLOCK' ? '<span id="close-update-banner" style="float: left; cursor: pointer; font-size: 20px; line-height: 1;">×</span>' : ''}
    `;

    document.body.prepend(banner);
    document.body.appendChild(blurOverlay);

    if (status === 'BLOCK') {
        document.body.style.overflow = 'hidden';
    }

    if (status !== 'BLOCK') {
        document.getElementById('close-update-banner').onclick = () => {
            banner.remove();
            blurOverlay.remove();
            document.body.style.overflow = 'auto';
        };
    }
}
const feedContainer = document.getElementById('feed-container');
const diffContent = document.getElementById('diff-content');
const loadingIndicator = document.getElementById('loading');
const emptyState = document.querySelector('.empty-state');
const mainBody = document.getElementById('main-body');

// --- משתנים גלובליים למנגנון הלמידה והסינון ---
let badWordCounter = JSON.parse(localStorage.getItem('badWordCounter') || "{}");
// מילים בטוחות (מוגדרות גלובלית כדי שגם מנגנון הלמידה וגם הסינון ישתמשו בהן)
const safeWords = ["תיקון", "הוספה", "עדכון", "קישור", "עריכה", "ויקיפדיה", "תקלדה", "עיצוב", "קישורים חיצוניים", "הגהה", "ניסוח", "ביטול", "שחזור", "פרק"];
// מילים חשודות בסיסיות
const basicSuspiciousWords = ["כלום", "אמת", "את האמת", "שקר", "את השקר", "נכון", "משעמם", "זה נכון", "אנטישמי", "אנטישמית", "סתם", "מלכה", "מלך"];

// --- כפתורים ומשתנים UI ---
const chkAnon = document.getElementById('chk-anon');
const chkLatest = document.getElementById('chk-latest');
const chkNs0 = document.getElementById('chk-ns0'); 
const chkSound = document.getElementById('chk-sound');
const volumeSlider = document.getElementById('volume-slider');
const selectOres = document.getElementById('select-ores');
const selectPatrol = document.getElementById('select-patrol'); 
const patrolControls = document.getElementById('patrol-controls');
const btn10 = document.getElementById('btn-10');
const btn50 = document.getElementById('btn-50');
const btn100 = document.getElementById('btn-100');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const btnTestNotification = document.getElementById('btn-test-notification');

// --- מנוע אודיו מתקדם (Web Audio API) להגברה ---
let audioCtx;
let audioBuffer = null;
let currentVolume = 1.0;

// אתחול האודיו
function initAudio() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        // טעינת הקובץ לזיכרון
        fetch('New edit.wav')
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
            .then(decodedAudio => {
                audioBuffer = decodedAudio;
            })
            .catch(e => console.error("Error loading audio:", e));
            
        // שחזור ווליום שמור
        const savedVolume = localStorage.getItem('soundVolume');
        if (savedVolume !== null) {
            currentVolume = parseFloat(savedVolume);
            if (volumeSlider) volumeSlider.value = currentVolume;
        }
    } catch (e) {
        console.error("Web Audio API not supported");
    }
}

// נגינה עם הגברה (Gain)
function playSoundWithGain() {
    if (!audioCtx || !audioBuffer) return;
    
    // אם הדפדפן הקפיא את האודיו, נחדש אותו
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = currentVolume; // יכול להיות גדול מ-1 (הגברה)

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
}

// הפעלת מנוע האודיו
initAudio();

// אירוע שינוי ווליום
if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        currentVolume = parseFloat(volumeSlider.value);
        localStorage.setItem('soundVolume', currentVolume);
    });
    // צליל בדיקה כשעוזבים את הסליידר
    volumeSlider.addEventListener('change', () => {
        playSoundWithGain();
    });
}

// --- רשימת מעקב UI ---
const watchlistHeader = document.getElementById('watchlist-header');
const watchlistContent = document.getElementById('watchlist-content');
const inputUsername = document.getElementById('input-username');
const btnAddUser = document.getElementById('btn-add-user');
const watchlistList = document.getElementById('watchlist-list');

const pagesMap = new Map();
let watchlist = []; 

// --- בדיקת הרשאות מנטר ---
checkPatrolRights();
async function checkPatrolRights() {
    try {
        const url = `https://he.wikipedia.org/w/api.php?action=query&meta=userinfo&uiprop=groups|rights&format=json`;
        const res = await fetch(url, { credentials: 'include', cache: 'no-store' }); 
        const json = await res.json();
        if (json.query && json.query.userinfo) {
            const { groups = [], rights = [] } = json.query.userinfo;
            if (groups.includes('patroller') || groups.includes('sysop') || rights.includes('patrol')) {
                if (patrolControls) patrolControls.style.display = 'block';
            }
        }
    } catch (e) { }
}

// --- המנגנון החכם: מנתח שחזורים, הולך אחורה, וסופר עד 6 ---
async function analyzeReverts() {
    try {
        // 1. מביאים את השחזורים האחרונים
        const url = `https://he.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|ids|comment|tags&rclimit=20&format=json&origin=*`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (!json.query || !json.query.recentchanges) return;

        let learnedWords = JSON.parse(localStorage.getItem('learnedSuspiciousWords') || "[]");
        let listChanged = false;

        // עוברים על כל עריכה אחרונה
        for (const rc of json.query.recentchanges) {
            const comment = rc.comment || "";
            
            // 2. האם זו פעולת שחזור?
            if (comment.includes("ביטול עריכה") || comment.includes("שחזור עריכה") || (rc.tags && rc.tags.includes("mw-revert"))) {
                
                // הולכים לבדוק מה שוחזר! (גרסה אחת אחורה)
                const historyUrl = `https://he.wikipedia.org/w/api.php?action=query&prop=revisions&titles=${encodeURIComponent(rc.title)}&rvlimit=2&rvprop=comment&format=json&origin=*`;
                const histRes = await fetch(historyUrl);
                const histJson = await histRes.json();
                
                if (!histJson.query || !histJson.query.pages) continue;
                
                const pageId = Object.keys(histJson.query.pages)[0];
                const revisions = histJson.query.pages[pageId].revisions;

                // אם מצאנו את העריכה המקורית (ההשחתה)
                if (revisions && revisions.length === 2) {
                    const badEditComment = revisions[1].comment || ""; // זה התקציר של המשחית!
                    
                    const words = badEditComment.split(/\s+/);
                    words.forEach(word => {
                        const cleanWord = word.trim();
                        
                        // תנאי סף: ארוך מ-3, לא בטוח, ולא נלמד כבר
                        const isNotSafe = !safeWords.some(safe => cleanWord.includes(safe));
                        
                        if (cleanWord.length > 3 && isNotSafe && !learnedWords.includes(cleanWord)) {
                            
                            // 3. ספירה (רק אחרי 6 פעמים לומדים)
                            if (!badWordCounter[cleanWord]) badWordCounter[cleanWord] = 0;
                            badWordCounter[cleanWord]++;
                            
                            console.log(`⚠️ מילה חשודה אותרה ("${cleanWord}") - פעמים: ${badWordCounter[cleanWord]}`);

                            if (badWordCounter[cleanWord] >= 6) {
                                learnedWords.push(cleanWord);
                                listChanged = true;
                                
                                // הודעה למשתמש
                                chrome.notifications.create({
                                    type: 'basic',
                                    iconUrl: 'icon.png',
                                    title: '🤖 למידה הושלמה',
                                    message: `המילה "${cleanWord}" גרמה ל-6 שחזורים ונוספה לרשימה השחורה.`,
                                    priority: 1
                                });
                                
                                // איפוס המונה למילה הזו
                                delete badWordCounter[cleanWord];
                            }
                        }
                    });
                }
            }
        }

        // שמירה
        localStorage.setItem('badWordCounter', JSON.stringify(badWordCounter));
        
        if (listChanged) {
            // מגבילים ל-50 המילים האחרונות כדי לשמור על ביצועים
            localStorage.setItem('learnedSuspiciousWords', JSON.stringify(learnedWords.slice(-50)));
        }

    } catch (e) {
        console.error("Learning error:", e);
    }
}

// --- פונקציות עזר ---
function checkSuspiciousComment(comment) {
    if (!comment) return false;
    if (comment.includes("נוסף לקטגוריה")) return false;
    
    // בדיקת מילים בטוחות (גלובלי)
    if (safeWords.some(word => comment.includes(word))) return false;
    
    // בדיקת מילים חשודות בסיסיות
    if (basicSuspiciousWords.some(word => comment.includes(word))) return true;

    // בדיקת מילים שנלמדו ע"י המנגנון החכם
    const learnedWords = JSON.parse(localStorage.getItem('learnedSuspiciousWords') || "[]");
    return learnedWords.some(word => comment.includes(word));
}

if (localStorage.getItem('hasTestedNotifications') === 'true') {
    if (btnTestNotification) btnTestNotification.style.display = 'none';
}
if (btnTestNotification) {
    btnTestNotification.addEventListener('click', () => {
        if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') performTest();
                else alert("ההתראות חסומות בדפדפן.");
            });
        } else { performTest(); }
    });
}
function performTest() {
    playSoundWithGain();
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'בדיקה תקינה', message: 'ההתראות עובדות!', priority: 2, requireInteraction: true });
    if (btnTestNotification) btnTestNotification.style.display = 'none';
    localStorage.setItem('hasTestedNotifications', 'true');
}

// --- מצב כהה ---
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggleBtn.textContent = '☀️';
} else { themeToggleBtn.textContent = '🌙'; }

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// --- אתחול ---
loadWatchlist();
setInterval(verifyLatestRevisions, 4000); // בדיקת גרסאות אחרונות
setInterval(analyzeReverts, 60000); // הפעלת מנגנון הלמידה כל דקה

watchlistHeader.addEventListener('click', () => watchlistContent.classList.toggle('open'));

btnAddUser.addEventListener('click', () => {
    const user = inputUsername.value.trim();
    if (user && !watchlist.find(u => u.name === user)) {
        watchlist.push({ name: user, notify: true });
        saveWatchlist();
        renderWatchlist();
        inputUsername.value = '';
    }
});

function renderWatchlist() {
    watchlistList.innerHTML = '';
    if (watchlist.length === 0) {
        watchlistList.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center;">אין משתמשים במעקב</div>';
        return;
    }
    watchlist.forEach(item => {
        const div = document.createElement('div');
        div.className = 'tracked-user';
        div.innerHTML = `
            <span class="tracked-user-name" title="לחץ לטעינת היסטוריה">${item.name}</span>
            <div style="display:flex; align-items:center; gap:5px;">
                <input type="checkbox" title="קבל התראות" ${item.notify ? 'checked' : ''} class="notify-toggle">
                <span class="remove-user" title="הסר">×</span>
            </div>
        `;
        div.querySelector('.tracked-user-name').addEventListener('click', () => loadUserHistory(item.name));
        div.querySelector('.notify-toggle').addEventListener('change', (e) => {
            item.notify = e.target.checked;
            saveWatchlist();
        });
        div.querySelector('.remove-user').addEventListener('click', () => {
            watchlist = watchlist.filter(u => u.name !== item.name);
            saveWatchlist();
            renderWatchlist();
        });
        watchlistList.appendChild(div);
    });
}

function saveWatchlist() {
    chrome.storage.local.set({ watchlist: watchlist });
    chrome.runtime.sendMessage({ type: 'UPDATE_WATCHLIST' });
}

function loadWatchlist() {
    chrome.storage.local.get(['watchlist'], (result) => { if (result.watchlist) { watchlist = result.watchlist; renderWatchlist(); } });
}

// --- פילטרים ---
chkAnon.addEventListener('change', () => mainBody.classList.toggle('filter-anon-active', chkAnon.checked));
chkLatest.addEventListener('change', () => mainBody.classList.toggle('filter-latest-active', chkLatest.checked));
chkNs0.addEventListener('change', () => mainBody.classList.toggle('filter-ns0-active', chkNs0.checked));

selectOres.addEventListener('change', () => {
    mainBody.classList.remove('filter-ores-bad-active', 'filter-ores-good-active');
    if (selectOres.value === 'bad') mainBody.classList.add('filter-ores-bad-active');
    else if (selectOres.value === 'good') mainBody.classList.add('filter-ores-good-active');
});

btn10.addEventListener('click', () => loadHistory(10));
btn50.addEventListener('click', () => loadHistory(50));
btn100.addEventListener('click', () => loadHistory(100));

// --- טעינה ---
async function loadHistory(limit) {
    let fetchLimit = 500; 
    let params = `&rclimit=${fetchLimit}&rcshow=!bot`;
    if (chkAnon.checked) params += '|anon';
    if (chkNs0.checked) params += '&rcnamespace=0';
    if (selectPatrol.value === 'unpatrolled') params += '&rcshow=!patrolled'; 
    else if (selectPatrol.value === 'patrolled') params += '&rcshow=patrolled'; 
    params += '&rcprop=title|timestamp|ids|user|comment|sizes|oresscores|patrolled';
    loadFromApi(params, limit, false, true); 
}

async function loadUserHistory(username) {
    let params = `&rclimit=50&rcuser=${encodeURIComponent(username)}&rcshow=!bot&rcprop=title|timestamp|ids|user|comment|sizes|oresscores|patrolled`;
    if (chkNs0.checked) params += '&rcnamespace=0';
    loadFromApi(params, 50, true, true); 
}

function isAnonymousUser(data) {
    if (data.user_type === 'anon') return true;
    if (data.user && data.user.startsWith('~')) return true;
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:|^:[0-9a-fA-F]{1,4}$/;
    if (data.user && ipPattern.test(data.user)) return true;
    return false;
}

// --- Live Stream ---
const eventSource = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');

eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.bot) return; 

    if (selectPatrol.value === 'unpatrolled' && data.patrolled === true) return;
    if (selectPatrol.value === 'patrolled' && data.patrolled !== true) return;

    if (data.wiki === 'hewiki' && (data.type === 'edit' || data.type === 'new')) {
        if (emptyState) emptyState.style.display = 'none';
        
        const standardizedData = {
            title: data.title,
            user: data.user,
            user_type: data.user_type,
            timestamp: data.timestamp,
            comment: data.comment,
            revid: data.revision ? data.revision.new : null,
            old_revid: data.revision ? data.revision.old : null,
            size_diff: (data.length ? data.length.new - data.length.old : 0),
            namespace: data.namespace,
            oresscores: null,
            patrolled: data.patrolled 
        };
        
        if (chkSound.checked) {
            const isAnon = isAnonymousUser(standardizedData);
            let shouldPlay = true;
            if (chkAnon.checked && !isAnon) shouldPlay = false;
            if (chkNs0.checked && standardizedData.namespace !== 0) shouldPlay = false;
            
            if (selectOres.value === 'bad') {
                if (!checkSuspiciousComment(standardizedData.comment)) shouldPlay = false;
            } else if (selectOres.value === 'good') {
                shouldPlay = false;
            }

            if (shouldPlay) {
                playSoundWithGain();
            }
        }

        const element = addChangeItem(standardizedData, true, true);

        if (standardizedData.revid) {
            setTimeout(() => {
                fetchOresScore(standardizedData.revid, element);
            }, 2000);
        }
    }
};

async function fetchOresScore(revid, domElement) {
    if (!domElement) return;
    try {
        const url = `https://he.wikipedia.org/w/api.php?action=query&prop=revisions&revids=${revid}&rvprop=ids&oresscores=true&format=json`; 
        const res = await fetch(url, { credentials: 'include' });
        const json = await res.json();
        const pageId = Object.keys(json.query.pages)[0];
        if (pageId && json.query.pages[pageId].revisions) {
            const rev = json.query.pages[pageId].revisions[0];
            if (rev.oresscores) {
                applyOresColor(domElement, rev.oresscores);
            }
        }
    } catch (e) { }
}

function addChangeItem(data, prepend = true, forceBolt = false) {
    if (forceBolt) {
        const existingItems = Array.from(document.querySelectorAll('.change-item'));
        existingItems.forEach(oldItem => {
            if (oldItem.getAttribute('data-title') === data.title) {
                const icon = oldItem.querySelector('.lightning-icon');
                if (icon) icon.style.display = 'none';
                oldItem.classList.remove('is-latest');
            }
        });
    }

    const isTracked = watchlist.some(u => u.name === data.user);
    const item = document.createElement('div');
    const isAnon = isAnonymousUser(data);
    const userTypeClass = isAnon ? 'type-anon' : 'type-registered';
    const trackedClass = isTracked ? 'tracked-highlight' : '';
    const latestClass = forceBolt ? 'is-latest' : '';
    const nsClass = data.namespace === 0 ? 'namespace-0' : 'namespace-other';
    
    const isSuspicious = checkSuspiciousComment(data.comment);
    const suspiciousClass = isSuspicious ? 'suspicious-comment' : '';

    const encodedUser = encodeURIComponent(data.user);
    const encodedTitle = encodeURIComponent(data.title);
    
    const contribsUrl = `https://he.wikipedia.org/wiki/מיוחד:תרומות/${encodedUser}`;
    const talkUrl = `https://he.wikipedia.org/wiki/שיחת_משתמש:${encodedUser}`;
    const historyUrl = `https://he.wikipedia.org/w/index.php?title=${encodedTitle}&action=history`;
    const diffUrl = `https://he.wikipedia.org/w/index.php?title=${encodedTitle}&diff=${data.revid}&oldid=${data.old_revid}`;
    
    item.setAttribute('data-title', data.title);
    item.setAttribute('data-revid', data.revid);
    item.dataset.link = diffUrl;
    item.className = `change-item ${userTypeClass} ${trackedClass} ${latestClass} ${nsClass} ${suspiciousClass}`;
    if (data.oresscores) applyOresColor(item, data.oresscores);

    const sizeClass = data.size_diff > 0 ? 'plus' : (data.size_diff < 0 ? 'minus' : '');
    const sizeStr = data.size_diff > 0 ? `+${data.size_diff}` : `${data.size_diff}`;
    const timeStr = new Date(data.timestamp * 1000).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
    const lightningDisplay = forceBolt ? 'block' : 'none';

    let unpatrolledHtml = '';
    if (data.unpatrolled !== undefined || (data.patrolled === false)) { 
        unpatrolledHtml = `<span class="unpatrolled-mark" title="עריכה זו טרם נבדקה">!</span>`;
    }

    item.innerHTML = `
        <div class="title-row">
            <div class="title">
                <img src="lightning.png" class="lightning-icon" title="גרסה אחרונה" style="display: ${lightningDisplay}">
                ${data.title}
            </div>
            <div>
                <span class="diff-size ${sizeClass}">${sizeStr}</span>
                ${unpatrolledHtml}
            </div>
        </div>
        <div class="meta-row">
            <div class="user-info">
                <span class="user-name ${isAnon ? 'anon-style' : ''}">${isTracked ? '⭐ ' : ''}${data.user}</span>
                <a href="${contribsUrl}" target="_blank" class="action-link" title="תרומות">📝</a>
                <a href="${talkUrl}" target="_blank" class="action-link" title="שיחה">💬</a>
            </div>
            <div class="time-info">
                <a href="${historyUrl}" target="_blank" class="action-link" title="היסטוריה">🕒</a>
                <span class="time">${timeStr}</span>
            </div>
        </div>
        <div class="comment">${data.comment || '<i>(אין תקציר עריכה)</i>'}</div>
    `;

    pagesMap.set(data.title, item);
    item.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        document.querySelectorAll('.change-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        loadDiff(data.old_revid, data.revid, data.title);
    });

    if (prepend) feedContainer.insertBefore(item, feedContainer.firstChild);
    else feedContainer.appendChild(item);
    return item;
}

function checkOresStatus(scores) {
    if (!scores || !scores.damaging || !scores.goodfaith) return 'none';
    const damagingProb = scores.damaging.true;
    const goodfaithProb = scores.goodfaith.true;
    if (damagingProb >= 0.75) return 'very-bad';
    if (damagingProb >= 0.35) return 'bad';
    if (goodfaithProb >= 0.85 && damagingProb < 0.20) return 'good';
    return 'neutral';
}

function applyOresColor(element, scores) {
    const status = checkOresStatus(scores);
    element.classList.remove('ores-very-bad', 'ores-bad', 'ores-good');
    if (status === 'very-bad') element.classList.add('ores-very-bad');
    else if (status === 'bad') element.classList.add('ores-bad');
    else if (status === 'good') element.classList.add('ores-good');
}

// --- המנגנון היציב לטעינת נתונים (Loop & Fetch) ---
async function loadFromApi(baseParams, targetCount, isUserSpecific = false, useCredentials = false) {
    if (emptyState) emptyState.style.display = 'none';
    feedContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ טוען נתונים...</div>';
    pagesMap.clear();

    const collectedEdits = [];
    let continueToken = null;
    let requestsMade = 0;
    const MAX_REQUESTS = 200; 
    const BATCH_SIZE = 500;   

    const seenTitlesInBatch = new Set();

    try {
        while (collectedEdits.length < targetCount && requestsMade < MAX_REQUESTS) {
            
            let url = `https://he.wikipedia.org/w/api.php?action=query&list=recentchanges&format=json${baseParams}&rclimit=${BATCH_SIZE}`;
            
            if (!useCredentials) url += `&origin=*`;
            if (continueToken) url += `&rccontinue=${continueToken}`;

            const fetchOptions = useCredentials ? { credentials: 'include' } : {};
            const response = await fetch(url, fetchOptions);
            const json = await response.json();
            
            if (!json.query || !json.query.recentchanges) break;

            const batch = json.query.recentchanges;
            const candidates = []; 

            for (const rc of batch) {
                if (chkLatest.checked && seenTitlesInBatch.has(rc.title)) continue;

                let isValid = true;
                if (!isUserSpecific && selectOres.value !== 'all') {
                    const status = checkOresStatus(rc.oresscores);
                    const isSuspicious = checkSuspiciousComment(rc.comment);
                    if (selectOres.value === 'bad') {
                        if (status !== 'bad' && status !== 'very-bad' && !isSuspicious) isValid = false;
                    } else if (selectOres.value === 'good') {
                        if (status !== 'good') isValid = false;
                    }
                }

                if (isValid) {
                    candidates.push(rc);
                    if (chkLatest.checked) seenTitlesInBatch.add(rc.title);
                }
            }

            let verifiedBatch = [];
            
            if (chkLatest.checked && candidates.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < candidates.length; i += chunkSize) {
                    const chunk = candidates.slice(i, i + chunkSize);
                    const titles = chunk.map(c => c.title);
                    
                    const verifyUrl = `https://he.wikipedia.org/w/api.php?action=query&prop=info&titles=${titles.map(t=>encodeURIComponent(t)).join('|')}&format=json`;
                    const verifyRes = await fetch(verifyUrl, fetchOptions);
                    const verifyJson = await verifyRes.json();
                    
                    const realLatestMap = {}; 
                    if (verifyJson.query && verifyJson.query.pages) {
                        Object.values(verifyJson.query.pages).forEach(p => {
                            realLatestMap[p.title] = p.lastrevid;
                        });
                    }

                    const verifiedChunk = chunk.filter(rc => {
                        const realLast = realLatestMap[rc.title];
                        return realLast && rc.revid === realLast;
                    });
                    
                    verifiedBatch.push(...verifiedChunk);
                }
            } else {
                verifiedBatch = candidates;
            }

            for (const item of verifiedBatch) {
                if (collectedEdits.length < targetCount) {
                    item.isLatestCalculated = chkLatest.checked ? true : false;
                    if (!chkLatest.checked) {
                        if (!seenTitlesInBatch.has(item.title)) {
                            item.isLatestCalculated = true;
                            seenTitlesInBatch.add(item.title);
                        }
                    }
                    collectedEdits.push(item);
                }
            }

            if (json.continue && json.continue.rccontinue) {
                continueToken = json.continue.rccontinue;
            } else {
                break;
            }
            
            requestsMade++;
        }

        feedContainer.innerHTML = ''; 

        if (collectedEdits.length > 0) {
            for (const rc of collectedEdits) {
                const standardizedData = {
                    title: rc.title,
                    user: rc.user,
                    user_type: (rc.anon !== undefined) ? 'anon' : 'registered', 
                    timestamp: new Date(rc.timestamp).getTime() / 1000,
                    comment: rc.comment,
                    revid: rc.revid,
                    old_revid: rc.old_revid,
                    size_diff: rc.newlen - rc.oldlen,
                    namespace: rc.ns, 
                    oresscores: rc.oresscores,
                    unpatrolled: rc.unpatrolled,
                    patrolled: (rc.unpatrolled === undefined) 
                };
                addChangeItem(standardizedData, false, rc.isLatestCalculated); 
            }
        } else {
            feedContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">לא נמצאו עריכות העונות לקריטריונים.</div>';
        }

    } catch (e) {
        console.error(e);
        feedContainer.innerHTML = '<div style="text-align:center; color:red; padding:10px;">שגיאה בטעינת הנתונים.</div>';
    }
}

async function loadDiff(oldId, newId, title) {
    diffContent.innerHTML = '';
    loadingIndicator.style.display = 'block';
    document.getElementById('preview-title').innerText = `סקירת שינויים: ${title}`;
    const diffUrl = `https://he.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&diff=${newId}&oldid=${oldId}&rcid=&patrol=1`;

    if (!oldId || oldId === 0) {
        diffContent.innerHTML = `<div style='text-align:center; margin-top:20px; color:#007000; font-weight:bold;'>📄 דף חדש נוצר!</div><br><a href="${diffUrl}" target="_blank" class="diff-link-btn">עבור לערך החדש בויקיפדיה</a>`;
        loadingIndicator.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`https://he.wikipedia.org/w/api.php?action=compare&fromrev=${oldId}&torev=${newId}&format=json`);
        const json = await response.json();
        if (json.compare && json.compare['*']) {
            diffContent.innerHTML = `
                <table class="diff">
                    <colgroup><col class="diff-marker"><col class="diff-content"><col class="diff-marker"><col class="diff-content"></colgroup>
                    <tbody>${json.compare['*']}</tbody>
                </table>
                <br>
                <a href="${diffUrl}" target="_blank" class="diff-link-btn">🔗 פתח השוואת גרסאות בויקיפדיה</a>
            `;
        } else { diffContent.innerText = "לא ניתן להציג את ההבדלים."; }
    } catch (error) { diffContent.innerText = "שגיאה בטעינת הנתונים."; } finally { loadingIndicator.style.display = 'none'; }
}

async function verifyLatestRevisions() {
    const latestItems = Array.from(document.querySelectorAll('.change-item.is-latest'));
    if (latestItems.length === 0) return;

    const itemsByTitle = {};
    const titlesToCheck = new Set();

    latestItems.forEach(item => {
        const title = item.getAttribute('data-title');
        if (!title) return;
        if (!itemsByTitle[title]) itemsByTitle[title] = [];
        itemsByTitle[title].push(item);
        titlesToCheck.add(title);
    });

    const titlesArray = Array.from(titlesToCheck).slice(0, 50); 
    if (titlesArray.length === 0) return;

    try {
        const titlesParam = titlesArray.map(t => encodeURIComponent(t)).join('|');
        const url = `https://he.wikipedia.org/w/api.php?action=query&prop=info&titles=${titlesParam}&format=json`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.query && json.query.pages) {
            Object.values(json.query.pages).forEach(pageData => {
                const realLatestRevId = pageData.lastrevid;
                const title = pageData.title;

                if (itemsByTitle[title]) {
                    itemsByTitle[title].forEach(domItem => {
                        const myRevId = parseInt(domItem.getAttribute('data-revid'));
                        if (myRevId < realLatestRevId) {
                            const icon = domItem.querySelector('.lightning-icon');
                            if (icon) icon.style.display = 'none';
                            domItem.classList.remove('is-latest');
                        }
                    });
                }
            });
        }
    } catch (e) {}
}

document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;

    const selected = document.querySelector('.change-item.selected');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!selected) {
            const first = feedContainer.firstElementChild;
            if (first) first.click();
        } else {
            let next = selected.nextElementSibling;
            while (next && window.getComputedStyle(next).display === 'none') {
                next = next.nextElementSibling;
            }
            if (next) {
                next.click();
                next.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selected) {
            let prev = selected.previousElementSibling;
            while (prev && window.getComputedStyle(prev).display === 'none') {
                prev = prev.previousElementSibling;
            }
            if (prev) {
                prev.click();
                prev.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    if (e.key === 'Enter') {
        if (selected && selected.dataset.link) {
            window.open(selected.dataset.link, '_blank');
        }
    }
});