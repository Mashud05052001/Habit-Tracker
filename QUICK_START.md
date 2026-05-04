# 🚀 QUICK START - Web Push Notifications

## ⚡ 30-Second Setup

### Step 1: Create Environment File

Create a new file named `.env.local` in the project root with:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BA26cpPxFTuzE097nT6FK4BexnxBBk7OIoPBX5-4XOk7RC2owk8_XdRW5Ih5ACFbcwy8aEI4ph2O9PJL5T08BCQ
VAPID_PRIVATE_KEY=fsqAR2vUcaHxURbmKrhJpJHxmXlXavD5vCggs3iKPpM
VAPID_EMAIL=mailto:your-email@example.com
```

**That's it!** The rest is already done.

---

## 🧪 Testing in 5 Steps

### 1. Start Dev Server

```bash
npm run dev
```

Will run on http://localhost:3001 or 3002

### 2. Open App

Go to http://localhost:3001 (or 3002)

### 3. Enable Notifications

- Click your avatar (top right)
- Click Settings
- Toggle "Notifications" ON
- Set a time (e.g., 1 minute from now for quick test)
- Click "Update reminder"
- **Click "Allow" on the browser permission popup**

### 4. Test Immediately

- Click "Test now" button
- You should hear a **beep sound** 🔊
- You should see a notification in the **Windows notification area**
- You should see a toast message in the **app**

### 5. Verify Console

- Press `F12` to open DevTools
- Go to Console tab
- Look for:
  ```
  ✅ Push subscription successful
  ```
  If you see this, Web Push is working! ✓

---

## ✅ Success Indicators

### If Test Now Works:

- ✅ Sound alert plays (two-tone beep)
- ✅ Notification appears in Windows notification panel
- ✅ Toast message appears in app: "🔔 Test notification sent with sound alert"

### If Scheduled Reminder Works:

- ✅ Console shows: `[Reminder] Triggering at 13:11:30 (13:11)`
- ✅ Sound alert plays automatically at set time
- ✅ System notification appears
- ✅ Toast shows: "🔔 Daily reminder sent with sound alert"

### If Web Push Works:

- ✅ Console shows: `✅ Push subscription successful`
- ✅ Notification still appears even if tab is inactive (for scheduled reminders)

---

## ❌ Troubleshooting

### No Sound?

- [ ] Check system volume is ON
- [ ] Check browser isn't muted
- [ ] Reload page and try again
- [ ] Open DevTools Console and check for errors

### No Notification Showing?

- [ ] Browser asked for permission? → Click "Allow"
- [ ] Check: Settings → Site Settings → Notifications → Allow
- [ ] Refresh page with Ctrl+Shift+R (hard refresh)

### Reminder Not Triggering?

- [ ] Keep the **tab open** while testing
- [ ] Check console for `[Reminder] Triggering at...` message
- [ ] Verify reminder time is in future
- [ ] Check "Notification" toggle is ON in settings

### Subscription Failed?

- [ ] Create `.env.local` with keys (copy paste above)
- [ ] Restart dev server with `npm run dev`
- [ ] Check Console for error messages
- [ ] Ensure on localhost or HTTPS

---

## 📊 What Was Changed

### New Packages

- ✅ `web-push` - Web Push notification library

### New Files

- ✅ `generate-vapid-keys.js` - VAPID key generator
- ✅ `.env.local` - Environment variables ← **You need to create this**
- ✅ `src/app/api/notifications/subscribe/route.ts` - Subscription endpoint
- ✅ `src/app/api/notifications/send/route.ts` - Send endpoint
- ✅ `WEBPUSH_SETUP.txt` - Setup guide
- ✅ `NOTIFICATION_COMPLETE_GUIDE.md` - Full documentation
- ✅ `IMPLEMENTATION_SUMMARY.md` - What changed

### Updated Files

- ✅ `src/components/HabitTracker.tsx` - Subscribe + improved reminder check (5s instead of 15s)
- ✅ `src/lib/notificationUtils.ts` - Added Web Push functions
- ✅ `public/habitee-notification-sw.js` - Push event handler

---

## 🎯 Three Alert Types

### 1️⃣ **Sound Alert** 🔊

- Two-tone beep (800Hz + 600Hz)
- Web Audio API
- Works immediately
- Volume: 60%

### 2️⃣ **Browser Notification** 📢

- System notification in Windows panel
- Like Telegram/Gmail notifications
- Persistent in notification center
- Dismissible by user

### 3️⃣ **Toast Message** 🍞

- In-app notification
- Shows result status
- 2.5 second duration
- Shows emoji + message

---

## 📝 Key Settings

### Reminder Check Interval

- **Current:** Every 5 seconds
- **Why:** Catch the exact minute more reliably
- **File:** `src/components/HabitTracker.tsx` line 48
- **To change:** Look for `REMINDER_CHECK_INTERVAL_MS = 5_000`

### Sound Volume

- **Current:** 60%
- **File:** `src/components/HabitTracker.tsx` lines with `volumeLevel: 0.6`
- **Valid range:** 0.0 (silent) to 1.0 (loud)

### VAPID Email

- **Current:** `mailto:your-email@example.com`
- **File:** `.env.local`
- **For production:** Use your actual email

---

## 🚨 IMPORTANT

### ⚠️ Security Note

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = Safe to expose ✅
- `VAPID_PRIVATE_KEY` = **KEEP SECRET** 🔐
  - Don't commit to Git
  - Don't share
  - Never push to GitHub
  - Only in `.env.local` (gitignored)

### ⚠️ Requirements

- **For Dev:** localhost (http://localhost:3001) ✅
- **For Production:** HTTPS only (https://example.com) ✅
- **Not:** http://example.com ❌ (Web Push won't work)

### ⚠️ Browser Permission

- First test: Browser will ask permission
- Click "Allow" to enable notifications
- Can be changed in browser settings later

---

## 📞 Still Need Help?

1. **Console Errors?**
   - Press F12 → Console tab
   - Copy error and search online

2. **Reminder not triggering?**
   - Check Console for: `[Reminder] Triggering at...`
   - Keep tab open while testing
   - Wait for exact minute you set

3. **Web Push not working?**
   - Console should show: `✅ Push subscription successful`
   - If missing, check `.env.local` keys

4. **Full Guides Available:**
   - `NOTIFICATION_COMPLETE_GUIDE.md` - Everything explained
   - `WEBPUSH_SETUP.txt` - Advanced setup
   - `IMPLEMENTATION_SUMMARY.md` - Technical details

---

## ✨ What Happens Now

1. **You set reminder time** → App subscribes to Web Push
2. **When time arrives** → Service Worker triggered
3. **Notification shows** → Windows notification panel + sound + toast
4. **User can click** → Opens app or focuses window

All three notification types work together seamlessly! 🎉

---

## 🎬 Demo Flow

```
User opens Settings
    ↓
Enables Notifications
    ↓
Sets reminder time (e.g., 14:30)
    ↓
Clicks "Update reminder"
    ↓
Browser asks permission
    ↓
User clicks "Allow"
    ↓
✅ App subscribes to Web Push
    ↓
App shows toast: "Daily reminder set..."
    ↓
[Later when 14:30 arrives...]
    ↓
🔊 Sound alert plays
    ↓
📢 Notification appears in Windows panel
    ↓
🍞 Toast shows in app
    ↓
User sees all three at once!
```

---

## Ready? Let's Go! 🚀

1. Create `.env.local` (copy-paste the keys)
2. Run `npm run dev`
3. Open app and enable notifications
4. Click "Test now"
5. Enjoy your notifications!

**Questions?** Check the full guides linked above. Happy coding! 💻
