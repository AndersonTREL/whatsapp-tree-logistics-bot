class MultiLanguageService {
  detectLanguage(message) {
    const messageLower = message.toLowerCase();
    
    // Albanian detection
    const albanianWords = ['përshëndetje', 'faleminderit', 'ju lutem', 'kam', 'nevojë', 'problem'];
    if (albanianWords.some(word => messageLower.includes(word))) {
      return 'sq'; // Albanian
    }
    
    // German detection
    const germanWords = ['guten', 'hallo', 'danke', 'bitte', 'ich', 'brauche', 'problem'];
    if (germanWords.some(word => messageLower.includes(word))) {
      return 'de'; // German
    }
    
    // Default to English
    return 'en';
  }

  getAcknowledgmentMessage(firstName, category, requestId, language = 'en') {
    const templates = {
      en: {
        greeting: `🌲 Hello ${firstName}! Welcome to Tree Logistics Support 👋`,
        thanks: `Thank you for contacting Tree Logistics. Your request has been received and will be reviewed by our professional team.`,
        category: `📋 Request Category: ${category}`,
        requestId: `🆔 Request ID: ${requestId}`,
        response: `⏰ Expected Response: 24-48 hours`,
        closing: `We appreciate your patience and will get back to you as soon as possible.`,
        signature: `🌲 Best Regards,\nTree Logistics Team\n📧 support@treelogistics.com`
      },
      sq: {
        greeting: `Përshëndetje ${firstName}! 👋`,
        thanks: `Faleminderit që kontaktuat Tree Logistics. Kërkesa juaj është marrë dhe do të rishikohet nga ekipi ynë.`,
        category: `📋 Kategoria: ${category}`,
        requestId: `✅ ID e Kërkesës: ${requestId}`,
        response: `⏰ Përgjigje e Pritshme: 24-48 orë`,
        closing: `Ju falënderojmë për durimin tuaj dhe do t'ju përgjigjemi sa më shpejt të jetë e mundur.`,
        signature: `Me respekt,\nEkipi i Tree Logistics`
      },
      de: {
        greeting: `Hallo ${firstName}! 👋`,
        thanks: `Vielen Dank, dass Sie Tree Logistics kontaktiert haben. Ihre Anfrage wurde empfangen und wird von unserem Team überprüft.`,
        category: `📋 Kategorie: ${category}`,
        requestId: `✅ Anfrage-ID: ${requestId}`,
        response: `⏰ Erwartete Antwort: 24-48 Stunden`,
        closing: `Wir schätzen Ihre Geduld und werden uns so schnell wie möglich bei Ihnen melden.`,
        signature: `Mit freundlichen Grüßen,\nTree Logistics Team`
      }
    };

    const template = templates[language] || templates.en;
    
    return `${template.greeting}\n\n${template.thanks}\n\n${template.category}\n${template.requestId}\n${template.response}\n\n${template.closing}\n\n${template.signature}`;
  }

  getCompletionMessage(firstName, date, language = 'en') {
    const templates = {
      en: {
        greeting: `🎉 Great news ${firstName}!`,
        message: `Your request has been resolved and closed.`,
        status: `✅ Status: Completed`,
        resolved: `📅 Resolved: ${date}`,
        followUp: `If you have any additional questions or concerns, please don't hesitate to contact us again.`,
        thanks: `Thank you for your patience!`,
        signature: `Best Regards,\nTree Logistics Team 🚀`
      },
      sq: {
        greeting: `🎉 Lajme të mira ${firstName}!`,
        message: `Kërkesa juaj është zgjidhur dhe mbyllur.`,
        status: `✅ Statusi: E Përfunduar`,
        resolved: `📅 Zgjidhur: ${date}`,
        followUp: `Nëse keni pyetje ose shqetësime shtesë, mos hezitoni të na kontaktoni përsëri.`,
        thanks: `Faleminderit për durimin tuaj!`,
        signature: `Me respekt,\nEkipi i Tree Logistics 🚀`
      },
      de: {
        greeting: `🎉 Gute Nachrichten ${firstName}!`,
        message: `Ihre Anfrage wurde gelöst und geschlossen.`,
        status: `✅ Status: Abgeschlossen`,
        resolved: `📅 Gelöst: ${date}`,
        followUp: `Wenn Sie weitere Fragen oder Bedenken haben, zögern Sie nicht, uns erneut zu kontaktieren.`,
        thanks: `Vielen Dank für Ihre Geduld!`,
        signature: `Mit freundlichen Grüßen,\nTree Logistics Team 🚀`
      }
    };

    const template = templates[language] || templates.en;
    
    return `${template.greeting}\n\n${template.message}\n\n${template.status}\n${template.resolved}\n\n${template.followUp}\n\n${template.thanks}\n\n${template.signature}`;
  }

  getCategoryName(category, language = 'en') {
    const translations = {
      'Salary': { en: 'Salary', sq: 'Paga', de: 'Gehalt' },
      'Schedule': { en: 'Schedule', sq: 'Orari', de: 'Zeitplan' },
      'Vehicle': { en: 'Vehicle', sq: 'Automjet', de: 'Fahrzeug' },
      'Equipment': { en: 'Equipment', sq: 'Pajisje', de: 'Ausrüstung' },
      'Leave/Absence': { en: 'Leave/Absence', sq: 'Pushim', de: 'Urlaub' },
      'Emergency': { en: 'Emergency', sq: 'Emergjencë', de: 'Notfall' },
      'Other': { en: 'Other', sq: 'Tjetër', de: 'Sonstiges' }
    };

    return translations[category]?.[language] || category;
  }

  getCategoryUpdateMessage(firstName, newCategory, requestId, language = 'en') {
    const translatedCategory = this.getCategoryName(newCategory, language);
    
    const templates = {
      en: {
        greeting: `Thank you ${firstName}! ✅`,
        updated: `Your request category has been updated to:`,
        category: `📋 New Category: ${translatedCategory}`,
        requestId: `🆔 Request ID: ${requestId}`,
        message: `Our team will now handle your request accordingly.`,
        response: `⏰ Expected Response: 24-48 hours`,
        signature: `Best Regards,\nTree Logistics Team`
      },
      sq: {
        greeting: `Faleminderit ${firstName}! ✅`,
        updated: `Kategoria e kërkesës suaj është përditësuar në:`,
        category: `📋 Kategoria e Re: ${translatedCategory}`,
        requestId: `🆔 ID e Kërkesës: ${requestId}`,
        message: `Ekipi ynë tani do ta trajtojë kërkesën tuaj në përputhje me rrethanat.`,
        response: `⏰ Përgjigje e Pritshme: 24-48 orë`,
        signature: `Me respekt,\nEkipi i Tree Logistics`
      },
      de: {
        greeting: `Vielen Dank ${firstName}! ✅`,
        updated: `Ihre Anfragekategorie wurde aktualisiert auf:`,
        category: `📋 Neue Kategorie: ${translatedCategory}`,
        requestId: `🆔 Anfrage-ID: ${requestId}`,
        message: `Unser Team wird Ihre Anfrage nun entsprechend bearbeiten.`,
        response: `⏰ Erwartete Antwort: 24-48 Stunden`,
        signature: `Mit freundlichen Grüßen,\nTree Logistics Team`
      }
    };

    const template = templates[language] || templates.en;
    
    return `${template.greeting}\n\n${template.updated}\n\n${template.category}\n${template.requestId}\n\n${template.message}\n\n${template.response}\n\n${template.signature}`;
  }
}

module.exports = new MultiLanguageService();

