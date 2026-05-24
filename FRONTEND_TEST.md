# 🧪 Frontend Testing Guide

Your frontend is now connected to the real backend! Follow these steps to test.

## ✅ Prerequisites

- [x] Backend running on `http://localhost:3000`
- [x] Mock data removed from frontend
- [x] Configuration pointing to correct backend

## 🚀 Testing Steps

### **1. Open the Signals Page**

Navigate to: `http://127.0.0.1:5500/frontend/signals/signal-page.html`

**Expected Result:**
- ✅ Page loads without errors
- ✅ Console shows: `🧪 MOCK MODE: Using mock signals data` **should NOT appear**
- ✅ Console shows: `📡 Fetching signals from backend...`
- ✅ 3 signal cards appear on the page

---

### **2. View Signal Details**

**Action:** Click on any signal card

**Expected Result:**
- ✅ Modal opens showing full signal details
- ✅ All sections populated (Evidence, Interpretation, City Impact, Narrative Seed)
- ✅ "Create LinkedIn Post" button visible

---

### **3. Test Authentication Flow**

**Action:** Click "Create LinkedIn Post" button (without logging in)

**Expected Result:**
- ✅ Redirects to login page: `/frontend/login/login.html`

---

### **4. Test Signup**

Navigate to: `http://127.0.0.1:5500/frontend/signup/signup.html`

**Action:**
1. Fill in signup form:
   - Name: Your Name
   - Email: your@email.com
   - Password: yourpassword
2. Click "Sign Up"

**Expected Result:**
- ✅ Account created successfully
- ✅ Redirected to login or dashboard

---

### **5. Test Login**

Navigate to: `http://127.0.0.1:5500/frontend/login/login.html`

**Action:**
1. Enter credentials from step 4
2. Click "Login"

**Expected Result:**
- ✅ Login successful
- ✅ JWT token stored in localStorage
- ✅ Redirected to dashboard or signals page

---

### **6. Test LinkedIn Post Generation**

**Action:**
1. Go back to signals page (logged in)
2. Click on any signal
3. Click "Create LinkedIn Post"

**Expected Result:**
- ✅ Loading state: "Generating..."
- ✅ Post modal opens with generated content
- ✅ Post is editable
- ✅ Copy button works
- ✅ Post saved to database

---

### **7. Verify in Browser Console**

Open Developer Tools (F12) and check console:

**Expected Logs:**
```
⚙️ SOORGA Configuration loaded
📡 API Base URL: http://localhost:3000/api
✅ Signal page loaded
📡 Fetching signals from backend...
✅ Fetched 3 signals
```

**Should NOT see:**
```
🧪 MOCK MODE: Using mock signals data  ❌
🧪 Mock data loaded  ❌
```

---

## 🐛 Troubleshooting

### **No Signals Loading**

**Check:**
1. Backend is running: `curl http://localhost:3000/api/signals`
2. Browser console for errors
3. Network tab shows request to `http://localhost:3000/api/signals`

**Fix:**
- Restart backend: `npm start`
- Clear browser cache (Ctrl+Shift+Delete)
- Check CORS is enabled in backend

---

### **"Failed to fetch" Error**

**Cause:** Backend not running or wrong port

**Fix:**
```bash
# Check backend status
curl http://localhost:3000/

# If not running, start it
cd backend/trunida-backend
npm start
```

---

### **CORS Error**

**Cause:** Backend CORS not configured correctly

**Fix:** CORS is already enabled in `server.js`:
```javascript
app.use(cors());
```

If still getting errors, add specific origin:
```javascript
app.use(cors({
  origin: 'http://127.0.0.1:5500'
}));
```

---

## ✅ Success Checklist

After testing, verify:

- [ ] Signals load from backend (not mock data)
- [ ] Signal details modal works
- [ ] User can signup
- [ ] User can login
- [ ] JWT token stored correctly
- [ ] LinkedIn post generation works
- [ ] Generated posts saved to database
- [ ] Copy to clipboard works
- [ ] No console errors

---

## 📊 Database Verification

Check MongoDB to verify data is being saved:

**Signals Collection:**
- Should have 3 signals (seeded)

**Users Collection:**
- Should have your test user

**UserSignals Collection:**
- Should have generated LinkedIn posts

---

## 🎯 Next Steps

Once testing is complete:
1. ✅ Test all user flows
2. ✅ Check mobile responsiveness
3. ✅ Add more signals to database
4. ✅ Customize post generation template
5. ✅ Deploy to production

---

**Everything working?** 🎉 Your full-stack signals platform is ready!

Need help? Check the console logs for detailed error messages.
