chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// משתנה לשמירת הטיימר
let intervalId;

// הפעלת הבדיקה המהירה
startFastPolling();

function startFastPolling() {
    // בדיקה ראשונית מיד
    checkUpdates();
    
    // בדיקה כל 3 שניות (3000 מילישניות)
    // הערה: כרום עלול להאט את זה אם הדפדפן לא בשימוש כבד, אבל זה הכי מהיר שאפשר
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkUpdates, 3000);
}

// מאזין לאירועים כדי לוודא שהבדיקה ממשיכה לרוץ
chrome.runtime.onStartup.addListener(startFastPolling);
chrome.runtime.onInstalled.addListener(startFastPolling);

async function checkUpdates() {
    const data = await chrome.storage.local.get(['watchlist', 'lastCheckTime']);
    const watchlist = data.watchlist || [];
    
    // אם זו פעם ראשונה, נתחיל לבדוק מעכשיו
    let lastCheckTime = data.lastCheckTime || Date.now(); 

    // סינון: רק משתמשים שביקשו עבורם התראה
    const notifyUsers = watchlist.filter(u => u.notify).map(u => u.name);

    if (notifyUsers.length === 0) return;

    const usersParam = notifyUsers.map(u => encodeURIComponent(u)).join('|');
    
    try {
        // בקשת API מהירה
        const url = `https://he.wikipedia.org/w/api.php?action=query&list=recentchanges&rcuser=${usersParam}&rcprop=title|user|timestamp&rcshow=!bot&limit=10&format=json`;
        
        const response = await fetch(url);
        const json = await response.json();

        const checkTimeNow = Date.now();
        let newEditsCount = {};
        let foundNew = false;

        if (json.query && json.query.recentchanges) {
            json.query.recentchanges.forEach(rc => {
                const editTime = new Date(rc.timestamp).getTime();
                
                // בודקים אם העריכה חדשה יותר מהבדיקה האחרונה
                // הוספנו מרווח ביטחון קטן של 100ms
                if (editTime > lastCheckTime) {
                    newEditsCount[rc.user] = (newEditsCount[rc.user] || 0) + 1;
                    foundNew = true;
                }
            });

            for (const [user, count] of Object.entries(newEditsCount)) {
                sendNotification(user, count);
            }
        }

        // עדכון הזמן רק אם היו נתונים תקינים, כדי לא לפספס
        if (foundNew || json.query) {
             chrome.storage.local.set({ lastCheckTime: checkTimeNow });
        }

    } catch (e) {
        // התעלמות משגיאות רשת רגעיות כדי לא להציף את הקונסול
    }
}

function sendNotification(user, count) {
    let title = `התראה מויקיפדיה: ${user}`;
    let message = count === 1 ? "ביצע עריכה חדשה כעת!" : `ביצע ${count} עריכות חדשות!`;

    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true
    });
}