const feedContainer = document.getElementById('feed-container');
const diffContent = document.getElementById('diff-content');
const loadingIndicator = document.getElementById('loading');
const emptyState = document.querySelector('.empty-state');
const mainBody = document.getElementById('main-body');

// כפתורים
const chkAnon = document.getElementById('chk-anon');
const chkLatest = document.getElementById('chk-latest');
const chkNs0 = document.getElementById('chk-ns0'); 
const chkSound = document.getElementById('chk-sound');
const selectOres = document.getElementById('select-ores'); 
const btn10 = document.getElementById('btn-10');
const btn50 = document.getElementById('btn-50');
const btn100 = document.getElementById('btn-100');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const btnTestNotification = document.getElementById('btn-test-notification');

// טעינת אודיו בטוחה
let notificationSound;
try {
    notificationSound = new Audio('New edit.wav');
} catch (e) {
    console.error("Audio file missing");
}

// רשימת מעקב UI
const watchlistHeader = document.getElementById('watchlist-header');
const watchlistContent = document.getElementById('watchlist-content');
const inputUsername = document.getElementById('input-username');
const btnAddUser = document.getElementById('btn-add-user');
const watchlistList = document.getElementById('watchlist-list');

const pagesMap = new Map();
let watchlist = []; 

// --- בדיקה והעלמת כפתור בדיקת ההתראות ---
// אם המשתמש כבר ביצע בדיקה בעבר, נעלים את הכפתור מיד
if (localStorage.getItem('hasTestedNotifications') === 'true') {
    if (btnTestNotification) btnTestNotification.style.display = 'none';
}

if (btnTestNotification) {
    btnTestNotification.addEventListener('click', () => {
        if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    performTest();
                } else {
                    alert("ההתראות חסומות בדפדפן. יש לאשר אותן בהגדרות.");
                }
            });
        } else {
            performTest();
        }
    });
}

function performTest() {
    playTestSound();
    
    // שליחת התראה
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'בדיקת מערכת תקינה',
        message: 'ההתראות עובדות! הכפתור הזה ייעלם כעת.',
        priority: 2,
        requireInteraction: true
    });

    // הסתרת הכפתור ושמירה בזיכרון לנצח
    if (btnTestNotification) btnTestNotification.style.display = 'none';
    localStorage.setItem('hasTestedNotifications', 'true');
}

function playTestSound() {
    if (notificationSound) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => {});
    }
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

setInterval(verifyLatestRevisions, 4000);

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
    if (selectOres.value === 'bad') {
        mainBody.classList.add('filter-ores-bad-active');
    } else if (selectOres.value === 'good') {
        mainBody.classList.add('filter-ores-good-active');
    }
});

btn10.addEventListener('click', () => loadHistory(10));
btn50.addEventListener('click', () => loadHistory(50));
btn100.addEventListener('click', () => loadHistory(100));

async function loadHistory(limit) {
    let fetchLimit = limit;
    if (selectOres.value !== 'all') {
        fetchLimit = 500; 
    }

    let params = `&rclimit=${fetchLimit}&rcshow=!bot`;
    if (chkAnon.checked) params += '|anon';
    if (chkNs0.checked) params += '&rcnamespace=0';
    
    params += '&rcprop=title|timestamp|ids|user|comment|sizes|oresscores';
    
    loadFromApi(params, limit);
}

async function loadUserHistory(username) {
    let params = `&rclimit=50&rcuser=${encodeURIComponent(username)}&rcshow=!bot&rcprop=title|timestamp|ids|user|comment|sizes|oresscores`;
    if (chkNs0.checked) params += '&rcnamespace=0';
    loadFromApi(params); 
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
            oresscores: null
        };
        
        if (chkSound.checked) {
            const isAnon = isAnonymousUser(standardizedData);
            let shouldPlay = true;
            if (chkAnon.checked && !isAnon) shouldPlay = false;
            if (chkNs0.checked && standardizedData.namespace !== 0) shouldPlay = false;
            
            if (shouldPlay && notificationSound) {
                notificationSound.currentTime = 0;
                notificationSound.play().catch(e => {});
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
        const url = `https://he.wikipedia.org/w/api.php?action=query&prop=revisions&revids=${revid}&rvprop=ids&oresscores=true&format=json&origin=*`;
        const res = await fetch(url);
        const json = await res.json();
        const pageId = Object.keys(json.query.pages)[0];
        if (pageId && json.query.pages[pageId].revisions) {
            const rev = json.query.pages[pageId].revisions[0];
            if (rev.oresscores) {
                applyOresColor(domElement, rev.oresscores);
            }
        }
    } catch (e) { console.error("Failed to fetch ORES", e); }
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
    
    const encodedUser = encodeURIComponent(data.user);
    const encodedTitle = encodeURIComponent(data.title);
    
    const contribsUrl = `https://he.wikipedia.org/wiki/מיוחד:תרומות/${encodedUser}`;
    const talkUrl = `https://he.wikipedia.org/wiki/שיחת_משתמש:${encodedUser}`;
    const historyUrl = `https://he.wikipedia.org/w/index.php?title=${encodedTitle}&action=history`;
    const diffUrl = `https://he.wikipedia.org/w/index.php?title=${encodedTitle}&diff=${data.revid}&oldid=${data.old_revid}`;
    
    item.setAttribute('data-title', data.title);
    item.setAttribute('data-revid', data.revid);
    item.dataset.link = diffUrl;
    
    item.className = `change-item ${userTypeClass} ${trackedClass} ${latestClass} ${nsClass}`;
    
    if (data.oresscores) {
        applyOresColor(item, data.oresscores);
    }

    const sizeClass = data.size_diff > 0 ? 'plus' : (data.size_diff < 0 ? 'minus' : '');
    const sizeStr = data.size_diff > 0 ? `+${data.size_diff}` : `${data.size_diff}`;
    const timeStr = new Date(data.timestamp * 1000).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
    const lightningDisplay = forceBolt ? 'block' : 'none';

    item.innerHTML = `
        <div class="title-row">
            <div class="title">
                <img src="lightning.png" class="lightning-icon" title="גרסה אחרונה" style="display: ${lightningDisplay}">
                ${data.title}
            </div>
            <span class="diff-size ${sizeClass}">${sizeStr}</span>
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

    if (prepend) {
        feedContainer.insertBefore(item, feedContainer.firstChild);
        if (feedContainer.children.length > 200) feedContainer.removeChild(feedContainer.lastChild);
    } else {
        feedContainer.appendChild(item);
    }
    
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

async function loadFromApi(params, targetCount = null) {
    if (emptyState) emptyState.style.display = 'none';
    feedContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ טוען נתונים...</div>';
    pagesMap.clear();

    try {
        const url = `https://he.wikipedia.org/w/api.php?action=query&list=recentchanges&origin=*&format=json${params}`;
        const response = await fetch(url);
        const json = await response.json();
        
        feedContainer.innerHTML = ''; 

        if (json.query && json.query.recentchanges) {
            const seenTitles = new Set();
            let addedCount = 0;

            for (const rc of json.query.recentchanges) {
                if (targetCount && addedCount >= targetCount) break;

                if (selectOres.value !== 'all') {
                    const status = checkOresStatus(rc.oresscores);
                    if (selectOres.value === 'bad') {
                        if (status !== 'bad' && status !== 'very-bad') continue; 
                    } else if (selectOres.value === 'good') {
                        if (status !== 'good') continue;
                    }
                }

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
                    oresscores: rc.oresscores 
                };

                let isLatest = false;
                if (!seenTitles.has(rc.title)) {
                    isLatest = true;
                    seenTitles.add(rc.title);
                }

                addChangeItem(standardizedData, false, isLatest);
                addedCount++; 
            }
            
            if (addedCount === 0) {
                feedContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">לא נמצאו תוצאות העונות לסינון המבוקש.</div>';
            }
        } else {
             feedContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">אין נתונים להצגה.</div>';
        }

    } catch (e) {
        feedContainer.innerHTML = '<div style="text-align:center; color:red; padding:10px;">שגיאה בטעינת הנתונים.</div>';
    }
}

async function loadDiff(oldId, newId, title) {
    diffContent.innerHTML = '';
    loadingIndicator.style.display = 'block';
    document.getElementById('preview-title').innerText = `סקירת שינויים: ${title}`;
    const diffUrl = `https://he.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&diff=${newId}&oldid=${oldId}`;

    if (!oldId || oldId === 0) {
        diffContent.innerHTML = `<div style='text-align:center; margin-top:20px; color:#007000; font-weight:bold;'>📄 דף חדש נוצר!</div><br><a href="${diffUrl}" target="_blank" class="diff-link-btn">עבור לערך החדש בויקיפדיה</a>`;
        loadingIndicator.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`https://he.wikipedia.org/w/api.php?action=compare&fromrev=${oldId}&torev=${newId}&format=json&origin=*`);
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
        const url = `https://he.wikipedia.org/w/api.php?action=query&prop=info&titles=${titlesParam}&format=json&origin=*`;
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