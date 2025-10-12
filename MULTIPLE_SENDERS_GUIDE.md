# 📱 Multiple Twilio WhatsApp Senders - Branding Guide

## 🎯 **Current Setup**
- **Sender 1**: `+15558791704` (already branded ✅)
- **Sender 2**: Need to configure branding

## 🔧 **How to Update Branding for Multiple Senders**

### **Method 1: Twilio Console (Recommended)**

#### **Step 1: Access Twilio Console**
1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging** → **WhatsApp** → **Senders**

#### **Step 2: Configure Each Sender**

**For each sender number:**

1. **Click on your sender number**
2. **Upload Company Logo**:
   - Click "Profile Photo" or "Business Profile Photo"
   - Upload your Tree Logistics logo (640x640 pixels recommended)
   - This will be the profile picture for this specific sender

3. **Update Business Profile**:
   - **Business Name**: "Tree Logistics"
   - **Description**: "Professional logistics support for drivers"
   - **Address**: Your company address
   - **Business Hours**: Your operating hours
   - **Website**: Your company website
   - **Email**: support@treelogistics.com

4. **Save Changes**

#### **Step 3: Repeat for All Senders**
- Configure each sender number with the same branding
- Each sender will have the same company logo and profile information

### **Method 2: Environment Variables (Advanced)**

If you want to use different senders for different purposes:

#### **Update your environment variables:**
```bash
# Primary sender (general support)
TWILIO_WHATSAPP_NUMBER=whatsapp:+15558791704

# Secondary sender (if you have another number)
TWILIO_WHATSAPP_NUMBER_2=whatsapp:+15558791705

# Support-specific sender
TWILIO_WHATSAPP_SUPPORT=whatsapp:+15558791704

# HR-specific sender
TWILIO_WHATSAPP_HR=whatsapp:+15558791704
```

#### **Benefits of Multiple Senders:**
- **Different Purposes**: Use different numbers for different departments
- **Brand Consistency**: Same logo and profile for all senders
- **Load Distribution**: Spread messages across multiple numbers
- **Department Routing**: Route HR messages to HR sender, etc.

## 🎨 **Branding Checklist for Multiple Senders**

### **✅ For Each Sender Number:**

#### **1. Profile Picture (Company Logo)**
- [ ] Upload Tree Logistics logo (640x640 pixels)
- [ ] Logo appears in all conversations from this sender
- [ ] Consistent branding across all senders

#### **2. Business Profile Information**
- [ ] **Business Name**: "Tree Logistics"
- [ ] **Description**: "Professional logistics support for drivers"
- [ ] **Address**: Your company address
- [ ] **Business Hours**: Operating hours
- [ ] **Website**: Your company website
- [ ] **Email**: support@treelogistics.com

#### **3. Message Templates (Optional)**
- [ ] Create branded message templates
- [ ] Use consistent Tree Logistics branding
- [ ] Include company logo emoji (🌲) in templates

## 🔍 **How to Find Your Sender Numbers**

### **In Twilio Console:**
1. Go to **Messaging** → **WhatsApp** → **Senders**
2. You'll see all your configured sender numbers
3. Each number can be configured individually

### **Check Current Configuration:**
```bash
# Check what numbers you have configured
curl -X GET "https://messaging.twilio.com/v1/WhatsApp/Senders" \
  -u "YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN"
```

## 🚀 **Implementation Steps**

### **Step 1: Identify All Your Senders**
- List all your WhatsApp sender numbers
- Note which one is currently active (`+15558791704`)

### **Step 2: Configure Each Sender**
- Upload company logo to each sender
- Update business profile information
- Ensure consistent branding across all senders

### **Step 3: Test Branding**
- Send test messages from each sender
- Verify company logo appears
- Check business profile information

### **Step 4: Update Code (Optional)**
If you want to use multiple senders for different purposes:
- Use the `multiSenderWhatsapp.js` service I created
- Configure environment variables
- Route messages based on category

## 📱 **Sender Configuration Examples**

### **Example 1: Same Branding, Different Numbers**
```
Sender 1: +15558791704
- Logo: Tree Logistics Logo
- Profile: Tree Logistics Support
- Purpose: General Support

Sender 2: +15558791705 (your second number)
- Logo: Tree Logistics Logo (same)
- Profile: Tree Logistics Support (same)
- Purpose: General Support (same)
```

### **Example 2: Department-Specific Senders**
```
General Support: +15558791704
- Logo: Tree Logistics Logo
- Profile: Tree Logistics Support
- Purpose: Equipment, Payroll, General

HR Department: +15558791705
- Logo: Tree Logistics Logo
- Profile: Tree Logistics HR
- Purpose: Vacation, Sick Leave, HR Issues
```

## 🎯 **Quick Setup Commands**

### **Check Current Senders:**
```bash
# In your project directory
echo "📋 Current senders configured:"
env | grep TWILIO_WHATSAPP
```

### **Test Branding:**
```bash
# Test message from your bot
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp \
  -d "Body=Test Branding&From=whatsapp:+4917616626841&ProfileName=Test"
```

## 🎉 **Summary**

### **What You Need to Do:**

1. **✅ Identify your second sender number**
2. **✅ Go to Twilio Console → WhatsApp → Senders**
3. **✅ Upload company logo to each sender**
4. **✅ Update business profile for each sender**
5. **✅ Test branding across all senders**

### **Result:**
- **Consistent branding** across all WhatsApp senders
- **Professional appearance** with company logo
- **Unified business profile** information
- **Better brand recognition** for drivers

## 🔧 **Need Help?**

**What's your second sender number?** 
- Please provide the number so I can help you configure it specifically
- I can create custom configuration for multiple senders
- I can help you set up department-specific routing

**Your WhatsApp bot will have consistent Tree Logistics branding across all sender numbers!** 🌲✨
