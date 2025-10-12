# 🔧 Deployment Environment Variables

## 📋 **Environment Variables for Railway/Render Deployment**

Copy these variables to your deployment platform (Railway/Render):

### **Required Variables:**

```bash
# Server Configuration
PORT=3000

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Google Sheets Configuration
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com

# OpenAI Configuration (Optional - system works without AI)
OPENAI_API_KEY=your_openai_api_key
```

---

## 🔍 **How to Get Your Values:**

### **1. Twilio Credentials:**
```bash
# From your .env file or Twilio Console:
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

### **2. Google Sheets:**
```bash
# From your Google Sheets setup:
GOOGLE_SHEET_ID=1xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@your-project.iam.gserviceaccount.com
```

### **3. OpenAI (Optional):**
```bash
# From your OpenAI account:
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 **Railway Deployment Steps:**

### **Step 1: Add Environment Variables**
1. Go to your Railway project dashboard
2. Click on your service
3. Go to "Variables" tab
4. Add each variable one by one

### **Step 2: Google Sheets Credentials**
For Google Sheets, you have two options:

**Option A: Service Account Key (Recommended)**
1. Download your `google-credentials.json` file
2. Copy the entire JSON content
3. Add as environment variable: `GOOGLE_CREDENTIALS_JSON`

**Option B: Individual Fields**
1. Add `GOOGLE_SHEET_ID`
2. Add `GOOGLE_SERVICE_ACCOUNT_EMAIL`
3. Make sure the service account has access to your sheet

---

## 🎯 **Quick Deployment Checklist:**

### **Before Deploying:**
- [ ] **Test locally** - Ensure everything works
- [ ] **Prepare credentials** - Have all environment variables ready
- [ ] **GitHub ready** - Code pushed to GitHub repository

### **During Deployment:**
- [ ] **Connect GitHub** - Link repository to Railway/Render
- [ ] **Add environment variables** - Copy all required variables
- [ ] **Wait for deployment** - Usually takes 2-3 minutes

### **After Deployment:**
- [ ] **Get deployment URL** - Note the webhook URL
- [ ] **Update Twilio webhook** - Point to new URL
- [ ] **Test deployed bot** - Verify all features work

---

## 📱 **Update Twilio Webhook:**

### **After Getting Deployment URL:**
```
OLD: https://uncommutable-eve-waxiest.ngrok-free.dev/webhook/whatsapp
NEW: https://your-project-name.railway.app/webhook/whatsapp
```

### **In Twilio Console:**
1. Go to Messaging → Try it Out → Send a WhatsApp Message
2. Update webhook URL to your deployment URL
3. Add `/webhook/whatsapp` at the end
4. Method: POST
5. Save

---

## 🔒 **Security Notes:**

### **Environment Variables:**
- ✅ **Never commit** `.env` file to GitHub
- ✅ **Use deployment platform** environment variables
- ✅ **Keep credentials secure** and private

### **Google Sheets Credentials:**
- ✅ **Upload as environment variable** (not file)
- ✅ **Service account** should have minimal permissions
- ✅ **Rotate credentials** regularly

---

## 🎉 **After Deployment:**

### **Your Bot Will Be:**
- ✅ **Available 24/7** - No need for your computer
- ✅ **Automatically updated** - Push to GitHub = auto-deploy
- ✅ **Professional URL** - `https://your-bot.railway.app`
- ✅ **Monitored** - Built-in logs and metrics

### **Drivers Can:**
- ✅ **Access anytime** - No downtime
- ✅ **Fast responses** - Cloud hosting
- ✅ **Reliable service** - Professional infrastructure

---

## 📞 **Support:**

### **If Deployment Fails:**
1. **Check logs** in Railway/Render dashboard
2. **Verify environment variables** are correct
3. **Ensure all dependencies** are in package.json
4. **Check Google Sheets permissions**

### **If Bot Doesn't Work:**
1. **Verify webhook URL** in Twilio Console
2. **Check environment variables** are set correctly
3. **Test webhook endpoint** manually
4. **Review deployment logs** for errors

---

**Ready to deploy? Follow the deployment guide and add these environment variables!** 🚀
