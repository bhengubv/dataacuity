const AIAssistant = {
    init: () => {
        const toggle = document.getElementById("ai-toggle");
        const minimize = document.getElementById("ai-minimize");
        const close = document.getElementById("ai-close");
        const send = document.getElementById("ai-send");
        const input = document.getElementById("ai-input");
        const widget = document.getElementById("ai-assistant");
        toggle.addEventListener("click", () => widget.classList.toggle("collapsed"));
        minimize.addEventListener("click", () => widget.classList.add("collapsed"));
        close.addEventListener("click", () => widget.style.display = "none");
        send.addEventListener("click", () => AIAssistant.sendMessage());
        input.addEventListener("keypress", (e) => { if (e.key === "Enter") AIAssistant.sendMessage(); });
    },
    sendMessage: async () => {
        const input = document.getElementById("ai-input");
        const messages = document.getElementById("ai-messages");
        const userMsg = input.value.trim();
        if (!userMsg) return;
        messages.innerHTML += `<div class="ai-message user">${userMsg}</div>`;
        input.value = "";
        messages.innerHTML += `<div class="ai-message assistant">Thinking...</div>`;
        messages.scrollTop = messages.scrollHeight;
        const response = await API.callAI(userMsg);
        messages.lastElementChild.textContent = response;
        messages.scrollTop = messages.scrollHeight;
    }
};
