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