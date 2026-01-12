const API = {
    async callAI(prompt) {
        try {
            const response = await fetch(CONFIG.services.aiBrain.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: "qwen2.5:7b", prompt: prompt, stream: false })
            });
            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error("AI API Error:", error);
            return "Sorry, I could not process your request.";
        }
    }
};
