// --- הגדרות פתיחת החלונית ---
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// --- משתנים לניהול הטיימר ---
let intervalId;

// --- מנגנון Keep Alive (מונע מכרום להרוג את התוסף) ---
const keepAlive = () => {
  chrome.runtime.getPlatformInfo((info) => {});
  setTimeout(keepAlive, 20000); 
};

chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

// --- הפעלת הלוגיקה ---
startFastPolling();

function startFastPolling() {
    checkUpdates(); 
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkUpdates, 3000); // כל 3 שניות
}

chrome.runtime.onInstalled.addListener(() => {
    keepAlive();
    startFastPolling();
});

// --- הפונקציה הראשית (המתוקנת) ---
async function checkUpdates() {
    const data = await chrome.storage.local.get(['watchlist', 'lastCheckTime']);
    const watchlist = data.watchlist || [];
    
    // אם אין זמן שמור, נגדיר לעכשיו
    let lastCheckTime = data.lastCheckTime || Date.now(); 

    // סינון: רק משתמשים שביקשו עבורם התראה ושם המשתמש אינו ריק
    const notifyUsers = watchlist
        .filter(u => u.notify && u.name && u.name.trim() !== '')
        .map(u => u.name.trim());

    if (notifyUsers.length === 0) return;

    // --- התיקון: פיצול הבקשות (Promise.all) ---
    // במקום בקשה אחת ארוכה שעלולה להיכשל, אנחנו שולחים בקשה לכל משתמש בנפרד במקביל.
    
    const fetchPromises = notifyUsers.map(user => {
        const url = `https://he.wikipedia.org/w/api.php?action=query&list=recentchanges&rcuser=${encodeURIComponent(user)}&rcprop=title|user|timestamp&rcshow=!bot&limit=50&format=json`;
        return fetch(url)
            .then(res => res.json())
            .catch(err => null); // אם בקשה אחת נכשלת, לא לעצור את האחרות
    });

    try {
        // מחכים שכל הבקשות יחזרו
        const results = await Promise.all(fetchPromises);

        const checkTimeNow = Date.now();
        let newEditsCount = {}; 
        let foundAnyNew = false;

        // עוברים על כל התשובות שקיבלנו
        results.forEach(json => {
            if (json && json.query && json.query.recentchanges) {
                json.query.recentchanges.forEach(rc => {
                    const editTime = new Date(rc.timestamp).getTime();
                    
                    // בדיקה אם העריכה חדשה
                    if (editTime > lastCheckTime) {
                        newEditsCount[rc.user] = (newEditsCount[rc.user] || 0) + 1;
                        foundAnyNew = true;
                    }
                });
            }
        });

        // שליחת התראות
        for (const [user, count] of Object.entries(newEditsCount)) {
            sendNotification(user, count);
        }

        // עדכון זמן הבדיקה האחרון (רק אם באמת בדקנו בהצלחה)
        // שים לב: אנחנו מעדכנים גם אם לא מצאנו כלום, כדי לקדם את השעון
        if (results.length > 0) {
             chrome.storage.local.set({ lastCheckTime: checkTimeNow });
        }

    } catch (e) {
        console.error("Critical error in checkUpdates", e);
    }
}

function sendNotification(user, count) {
    let title = `התראה מויקיפדיה: ${user}`;
    let message = "";

    if (count === 1) {
        message = "ביצע עריכה חדשה כעת.";
    } else {
        message = `ביצע ${count} עריכות חדשות בזמן שלא היית!`;
    }

    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true
    });
}
// ==========================================
// מנגנון בדיקת גרסה וחסימה (Background)
// ==========================================

// פונקציית עזר להשוואת מספרי גרסה
function wpCompareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    return v1.localeCompare(v2, undefined, { numeric: true, sensitivity: 'base' });
}

// הפונקציה המרכזית שבודקת מול GitHub
async function wpCheckAppVersion() {
    const VERSION_URL = 'https://raw.githubusercontent.com/gymlltrym-max/wikipatrol-pro/refs/heads/main/version.json';
    const currentVersion = chrome.runtime.getManifest().version;

    try {
        // משיכת הקובץ מ-GitHub עם Timestamp למניעת Cache
        const response = await fetch(VERSION_URL + '?t=' + Date.now());
        const data = await response.json();

        let status = 'OK';
        
        // 1. בדיקה אם הגרסה חסומה ספציפית (למשל 1.2.0)
        const isSpecificallyBlocked = data.blocked_versions && data.blocked_versions.includes(currentVersion);
        
        // 2. בדיקה אם הגרסה מתחת למינימום הנתמך
        const isBelowMinimum = wpCompareVersions(currentVersion, data.min_supported_version) < 0;

        if (isSpecificallyBlocked || isBelowMinimum) {
            status = 'BLOCK'; // אדום, בלי X
        } else if (wpCompareVersions(currentVersion, data.latest_version) < 0) {
            status = 'UPDATE_AVAILABLE'; // כתום, עם X
        }

        // שמירה ל-Storage כדי שה-Sidepanel ידע מה להציג
        await chrome.storage.local.set({ 
            updateStatus: {
                status: status,
                url: data.download_url,
                latest: data.latest_version
            }
        });
        
        console.log("WikiPatrol Version Check:", status);
    } catch (e) {
        console.error("Error in Version Check:", e);
    }
}

// הגדרת טיימר לבדיקה אוטומטית כל שעה
chrome.alarms.create('wpVersionCheckAlarm', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'wpVersionCheckAlarm') wpCheckAppVersion();
});

// הרצה מיידית כשהתוסף עולה
wpCheckAppVersion();