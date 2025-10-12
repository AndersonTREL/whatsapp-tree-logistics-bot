class CategoryMenuService {
  getCategoryMenu() {
    return {
      header: '🚛 Tree Logistics Support',
      body: 'Hello! Please select your request category:',
      items: [
        { id: '1', icon: '💰', title: 'Salary', description: 'Payment, payslips, salary questions' },
        { id: '2', icon: '👥', title: 'HR', description: 'HR documents, contracts, employment' },
        { id: '3', icon: '🚨', title: 'Accident/Damage Report', description: 'Vehicle damage, accidents' },
        { id: '4', icon: '📦', title: 'Equipment', description: 'Scanner, uniform, devices' },
        { id: '5', icon: '📝', title: 'Report', description: 'Report issues or concerns' },
        { id: '6', icon: '🏖️', title: 'Vacation/Sick Leave', description: 'Time off, sick leave, balance' }
      ]
    };
  }

  formatMenuAsText() {
    const menu = this.getCategoryMenu();
    let text = `${menu.header}\n\n${menu.body}\n\n📋 Categories:\n\n`;
    
    menu.items.forEach(item => {
      text += `${item.id}. ${item.icon} ${item.title}\n   ${item.description}\n\n`;
    });
    
    text += '━━━━━━━━━━━━━━━━━\nReply with number (1-6)\n\nBest Regards,\nTree Logistics Team';
    return text;
  }

  getCategoryFromSelection(selection) {
    const categories = {
      '1': 'Salary',
      '2': 'HR',
      '3': 'Accident/Damage',
      '4': 'Equipment',
      '5': 'Report',
      '6': 'Vacation/Sick Leave'
    };
    return categories[selection] || 'Other';
  }

  // Get numeric selection from category name (for AI routing)
  getCategorySelection(categoryName) {
    const selections = {
      'Salary': '1',
      'HR': '2',
      'Accident/Damage': '3',
      'Equipment': '4',
      'Report': '5',
      'Vacation/Sick Leave': '6'
    };
    return selections[categoryName] || null;
  }

  getFollowUpMessage(category, firstName) {
    const messages = {
      'Salary': {
        text: `💰 SALARY QUESTION\n\nHello ${firstName}! To help you quickly, please provide:\n\n📝 What is your question about?\n   1. Missing payment or wrong amount\n   2. Payslip request\n   3. Payment date/timing\n   4. Deductions or taxes\n   5. Bonus or overtime\n   6. Other salary question\n\n📅 Which month/period?\n   Example: "September 2025" or "Last week"\n\n💶 Expected amount vs Received?\n   Example: "Expected 2,500 EUR but received 2,300 EUR"\n\n🆔 Your employee ID (if known):\n   Example: "TL-12345"\n\nPlease provide these details:`,
        needsDetails: true
      },
      'HR': {
        text: `👥 HR REQUEST\n\nHello ${firstName}! Please tell us:\n\n📄 What document or information do you need?\n   • Employment certificate (Arbeitsbescheinigung)\n   • Contract copy\n   • Work permit/visa support\n   • Tax documents (Lohnsteuerbescheinigung)\n   • Social security certificate\n   • Reference letter\n   • Other HR document\n\n❓ Why do you need it?\n   Example: "For bank loan" or "For apartment rental"\n\n⏰ When do you need it by?\n   Example: "By Friday" or "Urgent - tomorrow"\n\n📧 How should we send it?\n   Example: "Email" or "Pick up at office"\n\nPlease provide these details:`,
        needsDetails: true
      },
      'Accident/Damage': {
        text: `🚨 ACCIDENT/DAMAGE REPORT\n\nHello ${firstName}! For proper documentation, we need:\n\n❗ WHAT HAPPENED?\n   Describe the incident clearly\n   Example: "Hit pole while reversing" or "Another car hit my van"\n\n📅 WHEN?\n   Date and time\n   Example: "Today at 14:30" or "Yesterday 10/10/2025 at 9:00 AM"\n\n📍 WHERE?\n   Full address or location\n   Example: "Hauptstrasse 45, Berlin" or "Amazon DBE3 parking lot"\n\n🚗 VEHICLE INFO:\n   • License plate number\n   • Vehicle number (if known)\n   Example: "B-TL 1234, Van #205"\n\n🤕 INJURIES?\n   Any injuries to you or others?\n   Example: "No injuries" or "Minor bruise on arm"\n\n👮 POLICE INVOLVED?\n   Police report number if available\n   Example: "Police report #12345" or "No police called"\n\n👥 OTHER PARTY?\n   If another vehicle involved, their info\n   Example: "White BMW, plate: B-AB 5678"\n\n📸 PHOTOS:\n   After sending this info, please send photos of:\n   • Vehicle damage (multiple angles)\n   • License plate visible\n   • Overall scene\n   • Other vehicle (if involved)\n\n🚨 EMERGENCY? Call immediately: +49 123 456 789\n\nPlease provide complete details:`,
        needsDetails: true
      },
      'Equipment': {
        text: `📦 EQUIPMENT REQUEST\n\nHello ${firstName}! What do you need?\n\n1. 🔴 Report broken/damaged equipment\n   Scanner broken, uniform torn, etc.\n\n2. 🆕 Request new equipment\n   First-time equipment request\n\n3. 🔧 Scanner technical issue\n   No internet, won't scan, battery problem\n\n4. 👕 Uniform request\n   New uniform, additional items, size change\n\n5. 📱 Other equipment issue\n   Cables, chargers, bags, etc.\n\nReply with the number (1-5):`,
        needsDetails: false
      },
      'Report': {
        text: `📝 CONFIDENTIAL REPORT\n\nHello ${firstName}! Your report will be handled confidentially.\n\n🔒 What would you like to report?\n\nSafety Issues:\n• Unsafe driving conditions\n• Vehicle safety concerns\n• Route hazards\n• Workplace safety\n\nWorkplace Issues:\n• Harassment or discrimination\n• Policy violations\n• Unfair treatment\n• Management concerns\n\nOperational Issues:\n• Customer complaints\n• Delivery problems\n• Route issues\n• Process problems\n\n📝 Please describe:\n\n1️⃣ What is happening?\n   Be specific about the issue\n\n2️⃣ When did this occur?\n   Date(s) and frequency\n   Example: "Multiple times this week" or "Today at 3 PM"\n\n3️⃣ Who is involved?\n   People, locations, customers (if relevant)\n\n4️⃣ Do you have evidence?\n   Photos, messages, witnesses?\n\n5️⃣ What action do you want?\n   What would resolve this?\n\n🔒 Remember: This is confidential and will be investigated properly.\n\nPlease provide your report:`,
        needsDetails: true
      },
      'Vacation/Sick Leave': {
        text: `🏖️ VACATION/SICK LEAVE\n\nHello ${firstName}! What do you need?\n\n1. 📅 Request vacation days\n   Plan time off in advance\n\n2. 🏥 Report sick leave TODAY\n   You are sick and cannot work today\n\n3. 📊 Check vacation balance\n   See your available vacation days\n\n4. ❓ Vacation policy question\n   Ask about rules, procedures, entitlement\n\nReply with the number (1-4):`,
        needsDetails: false
      }
    };

    const msg = messages[category] || messages['Report'];
    return `${msg.text}`;
  }

  getEquipmentSubMenu(selection) {
    const options = {
      '1': { // Broken equipment
        title: '🔴 Report Broken Equipment',
        message: `🔴 BROKEN EQUIPMENT REPORT\n\nWhat equipment is broken or damaged?\n\n1. 📱 Scanner (broken/cracked/not working)\n2. 👕 Uniform (torn/damaged)\n3. 🔌 Cable/Charger (broken/not charging)\n4. 🎒 Bag/Equipment bag (damaged)\n5. 📦 Other equipment\n\nReply with the number (1-5):`
      },
      '2': { // New equipment
        title: '🆕 Request New Equipment',
        message: `🆕 NEW EQUIPMENT REQUEST\n\nWhat equipment do you need?\n\n1. 📱 Scanner (first-time or additional)\n2. 👕 Uniform items (new driver or replacement)\n3. 🔌 Cables/Chargers (additional)\n4. 🎒 Equipment bag\n5. 📱 Phone mount/accessories\n6. 📦 Other equipment\n\nReply with the number (1-6):`
      },
      '3': { // Scanner not working
        title: '🔧 Scanner Issue',
        message: `🔧 SCANNER TECHNICAL ISSUE\n\nWhat is the problem with your scanner?\n\n1. 📡 No internet connection / Offline\n   Scanner shows "No connection" or offline\n\n2. 🔋 Battery issues\n   Won't charge, dies quickly, won't turn on\n\n3. 📸 Camera not scanning\n   Can't scan packages, camera frozen\n\n4. 💫 App crashing or frozen\n   App closes, freezes, won't open\n\n5. 📱 Screen cracked/broken\n   Physical damage to screen\n\n6. 📦 Other scanner issue\n   Different problem\n\nReply with the number (1-6):`
      },
      '4': { // Uniform
        title: '👕 Uniform Request',
        message: `👕 UNIFORM REQUEST\n\nWhat uniform items do you need?\n\n1. 👕 Shirt (Tree Logistics shirt)\n2. 👖 Pants (work pants)\n3. 🧥 Jacket/Vest (safety vest or jacket)\n4. 👟 Safety shoes (work shoes)\n5. 🧢 Cap/Hat (company cap)\n6. 🎒 Complete uniform set (all items)\n\nReply with the number (1-6):`
      },
      '5': { // Other
        title: '📱 Other Equipment',
        message: `📱 OTHER EQUIPMENT ISSUE\n\nPlease describe your equipment issue or request:\n\nInclude:\n\n📦 What item/equipment?\n   Example: "Fuel card" or "Safety gloves"\n\n❗ What's the problem or need?\n   Example: "Lost fuel card" or "Need gloves size L"\n\n📅 When did this start?\n   Example: "Yesterday" or "This morning"\n\n🆔 Equipment ID (if applicable):\n   Example: Scanner serial number, vehicle number\n\nPlease provide details:`
      }
    };
    return options[selection];
  }

  getVacationSubMenu(selection) {
    const options = {
      '1': { // Request vacation
        title: '📅 Request Vacation',
        message: `📅 VACATION REQUEST\n\nTo process your vacation request, please provide:\n\n📆 DATES NEEDED:\n   • Start date (DD/MM/YYYY)\n   • End date (DD/MM/YYYY)\n   • Total number of days\n   Example: "Start: 15/12/2025, End: 20/12/2025, Days: 6"\n\n❓ REASON (Optional but helpful):\n   Example: "Family visit" or "Wedding" or "Personal"\n\n📍 STATION:\n   Your current station (DBE3 or DBE2)\n\n⚠️ NOTICE:\n   • Minimum 2 weeks advance notice preferred\n   • Subject to manager approval\n   • You'll be notified within 48 hours\n\nPlease provide your vacation request details:`
      },
      '2': { // Sick leave
        title: '🏥 Report Sick Leave',
        message: `🏥 SICK LEAVE REPORT - TODAY\n\n⚠️ IMPORTANT INFORMATION:\n\n✅ CONFIRM YOU ARE:\n   1. Sick TODAY (${new Date().toLocaleDateString('en-GB')})\n   2. Unable to work your shift\n   3. Will provide doctor's note\n\n📋 GERMAN LAW REQUIREMENTS:\n   • Doctor's note (Krankmeldung) required within 3 days\n   • Must be from certified doctor\n   • Must show dates of sick leave\n\n📸 AFTER CONFIRMING:\n   You must send photo of doctor's note (can be sent later but within 3 days)\n\n📞 NEXT STEPS:\n   1. Confirm sick leave below\n   2. Rest and recover\n   3. Visit doctor if needed\n   4. Send doctor's note photo\n   5. Update us on return date\n\n━━━━━━━━━━━━━━━━━\n\nREPLY:\n• Type "CONFIRM" to report sick leave for TODAY\n• Type "CANCEL" if you need something else\n\nReply now:`
      },
      '3': { // Check balance
        title: '📊 Vacation Balance',
        message: `📊 VACATION BALANCE CHECK\n\n✅ Request received!\n\nYour HR team will respond with:\n\n📋 Annual Entitlement:\n   • Total vacation days per year\n   • Days based on your contract\n\n📅 Current Year Status:\n   • Days already used\n   • Days pending approval\n   • Days remaining available\n\n📆 Important Dates:\n   • Vacation year period\n   • Deadline to use days\n\n⏰ Response time: Within 24 hours\n\n✅ Request ID will be provided when our team responds.\n\nBest Regards,\nTree Logistics Team`
      },
      '4': { // Policy question
        title: '❓ Vacation Policy',
        message: `❓ VACATION POLICY QUESTION\n\nWhat would you like to know about vacation policies?\n\nCommon Questions:\n\n📋 Entitlement:\n   • How many vacation days do I get?\n   • Does entitlement increase with years?\n\n⏰ Timing:\n   • How far in advance to request?\n   • Can I take vacation during peak season?\n   • Minimum/maximum consecutive days?\n\n💰 Payment:\n   • Do I get paid during vacation?\n   • Vacation pay calculation?\n\n📅 Procedures:\n   • How to submit request?\n   • Who approves vacation?\n   • What if request is denied?\n\n🏥 Sick vs Vacation:\n   • Difference between sick leave and vacation?\n   • What if I get sick during vacation?\n\n🎄 Public Holidays:\n   • Which holidays are off?\n   • Holiday pay policy?\n\nPlease ask your specific question:`
      }
    };
    return options[selection];
  }

  getScannerOfflineMessage() {
    return `📡 SCANNER OFFLINE/NO INTERNET\n\nHello! Let's fix your scanner internet issue.\n\n📱 PLEASE PROVIDE:\n\n1️⃣ Scanner Phone Number:\n   The phone number of the scanner (not your personal phone)\n   Example: "+49 176 12345678" or "0176 12345678"\n   (Usually found in scanner settings or on device label)\n\n2️⃣ When did it stop working?\n   Example: "This morning" or "Yesterday afternoon" or "3 days ago"\n\n3️⃣ Error message shown:\n   Example: "No connection" or "Offline" or "Cannot connect"\n\n4️⃣ Your current station:\n   DBE3 or DBE2?\n\n━━━━━━━━━━━━━━━━━\n\n🔧 SOLUTION:\n   • Come to office TOMORROW\n   • Bring the scanner with you\n   • IT will fix the internet connection\n   • Usually takes 15-30 minutes\n\n📍 Office: Tree Logistics\n⏰ Hours: Monday-Friday 8:00 - 17:00\n\n━━━━━━━━━━━━━━━━━\n\nPlease provide the scanner phone number now:`;
  }

  getBrokenScannerMessage() {
    return `🔴 BROKEN SCANNER - RETURN REQUIRED\n\n📦 IMPORTANT PROCEDURE:\n\n✅ WHAT YOU NEED TO DO:\n\n1️⃣ RETURN broken scanner to office\n   • Bring it as soon as possible\n   • Preferably tomorrow or this week\n   • Don't throw it away!\n\n2️⃣ EXCHANGE for replacement\n   • We will prepare a new scanner for you\n   • Same-day exchange when you arrive\n   • Already configured and ready\n\n3️⃣ BRING with you:\n   • The broken scanner\n   • Scanner charger and cables\n   • Any accessories you have\n\n━━━━━━━━━━━━━━━━━\n\n📍 OFFICE LOCATION:\n   Tree Logistics Office\n   Monday-Friday: 8:00 - 17:00\n   Saturday: 9:00 - 13:00 (if urgent)\n\n📝 BEFORE COMING:\n   • Note your scanner serial number (if visible)\n   • Backup any important data\n\n🔄 REPLACEMENT:\n   • Replacement scanner prepared\n   • All apps pre-installed\n   • Quick setup (10 minutes)\n   • You can continue work same day\n\n━━━━━━━━━━━━━━━━━\n\n📝 PLEASE CONFIRM:\n   Type "CONFIRM" to acknowledge:\n   • You will bring broken scanner to office\n   • You understand the exchange process\n   • You know the office location and hours`;
  }

  getUniformSizeMessage() {
    return `👕 UNIFORM SIZE SELECTION\n\nWhat size do you need?\n\n📏 SIZE GUIDE:\n\n1. S (Small)\n   Chest: 86-91 cm | Height: 165-172 cm\n\n2. M (Medium)\n   Chest: 94-99 cm | Height: 170-178 cm\n\n3. L (Large)\n   Chest: 102-107 cm | Height: 176-184 cm\n\n4. XL (Extra Large)\n   Chest: 112-117 cm | Height: 182-190 cm\n\n5. XXL (Extra Extra Large)\n   Chest: 122-127 cm | Height: 188-196 cm\n\n💡 TIP: If between sizes, choose larger size for comfort\n\n📍 You can try sizes at office before ordering\n\nReply with the number (1-5):`;
  }
}

module.exports = new CategoryMenuService();

