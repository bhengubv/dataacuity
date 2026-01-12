// DataAcuity Portal Configuration

const CONFIG = {
    domain: "dataacuity.co.za",

    // App categories for organization
    categories: {
        productivity: { name: "Productivity", icon: "📋" },
        analytics: { name: "Analytics", icon: "📊" },
        automation: { name: "Automation", icon: "⚡" },
        development: { name: "Development", icon: "💻" },
        admin: { name: "Administration", icon: "⚙️" }
    },

    // All available apps/services - using production URLs
    apps: {
        markets: {
            id: "markets",
            name: "Stock Tracker",
            description: "See stock prices and market news",
            example: "Check if Apple or Tesla went up today",
            icon: "📈",
            category: "analytics",
            url: "https://markets.dataacuity.co.za",
            apiUrl: "https://dataacuity.co.za/ai-api",
            color: "#007AFF",
            featured: true,
            freeTier: true
        },
        crm: {
            id: "crm",
            name: "Contacts",
            description: "Keep track of your customers and leads",
            example: "Save a new customer's phone number and notes",
            icon: "👥",
            category: "productivity",
            url: "https://twenty.dataacuity.co.za",
            color: "#3b82f6",
            featured: true
        },
        analytics: {
            id: "analytics",
            name: "Charts & Reports",
            description: "Turn your data into easy-to-read charts",
            example: "See how many sales you made this month",
            icon: "📊",
            category: "analytics",
            url: "https://super.dataacuity.co.za",
            color: "#8b5cf6",
            featured: true
        },
        workflows: {
            id: "workflows",
            name: "Workflow Studio",
            description: "Run your whole business on autopilot with AI",
            example: "Chase unpaid invoices and follow up with customers automatically",
            icon: "🏗️",
            category: "automation",
            url: "https://n8n.dataacuity.co.za",
            color: "#007AFF",
            featured: true,
            proTier: true,
            examples: [
                "Auto-reply to customer emails using AI",
                "Send payment reminders until invoice is paid",
                "Get weekly sales reports emailed to you",
                "Track orders from multiple shops in one place",
                "Different follow-ups based on what they bought",
                "Auto-generate quotes and send for approval"
            ]
        },
        automatisch: {
            id: "automatisch",
            name: "Quick Automate",
            description: "Set up simple automations in 5 minutes, no tech skills needed",
            example: "Get a WhatsApp message every time someone buys from you",
            icon: "⚡",
            category: "automation",
            url: "https://automatisch.dataacuity.co.za",
            color: "#007AFF",
            featured: true,
            freeTier: true,
            freeLimit: 10,
            examples: [
                "Send thank-you email when someone buys",
                "Get notified on your phone for new orders",
                "Save new customers to a spreadsheet",
                "Auto-post to socials when you upload content",
                "Send appointment reminders automatically",
                "Add email signups to your mailing list"
            ]
        },
        ai: {
            id: "ai",
            name: "Ask AI",
            description: "Chat with AI to get answers and help",
            example: "Write a thank you email for a customer",
            icon: "🧠",
            category: "development",
            url: "https://brain.dataacuity.co.za",
            color: "#ec4899",
            featured: true
        },
        etl: {
            id: "etl",
            name: "Connect Apps",
            description: "Move data between different apps",
            example: "Copy new orders from your shop to a spreadsheet",
            icon: "🔄",
            category: "automation",
            url: "https://airbyte.dataacuity.co.za",
            color: "#06b6d4"
        },
        converter: {
            id: "converter",
            name: "File Tools",
            description: "Change files from one type to another",
            example: "Turn a Word document into a PDF",
            icon: "📁",
            category: "productivity",
            url: "https://morph.dataacuity.co.za",
            color: "#007AFF",
            freeTier: true
        },
        bio: {
            id: "bio",
            name: "My Link Page",
            description: "One page with all your important links",
            example: "Share your Instagram, shop, and contact on one page",
            icon: "🔗",
            category: "productivity",
            url: "https://bio.dataacuity.co.za",
            color: "#007AFF",
            freeTier: true
        },
        grafana: {
            id: "grafana",
            name: "System Health",
            description: "Check if everything is running smoothly",
            example: "See if your website or apps are online",
            icon: "💚",
            category: "admin",
            url: "https://dashboard.dataacuity.co.za",
            color: "#f97316"
        }
    },

    // Onboarding steps
    onboarding: [
        {
            icon: "👋",
            title: "Welcome to DataAcuity",
            description: "Your unified platform for data intelligence, analytics, and automation."
        },
        {
            icon: "📊",
            title: "Explore Your Apps",
            description: "Access all your tools from one dashboard. Click any app card to open it."
        },
        {
            icon: "⌨️",
            title: "Quick Navigation",
            description: "Press Cmd+K (or Ctrl+K) anytime to quickly search and open apps."
        },
        {
            icon: "🎨",
            title: "Personalize",
            description: "Toggle dark mode with the moon icon. Your preference is saved automatically."
        }
    ],

    // Status check settings
    statusCheck: {
        interval: 30000,
        timeout: 5000
    }
};
