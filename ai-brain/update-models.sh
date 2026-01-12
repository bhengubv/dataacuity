#!/bin/bash
docker exec ai_brain_ollama ollama pull qwen2.5:7b >> /var/log/ollama-update.log 2>&1
echo "Update check completed at $(date)" >> /var/log/ollama-update.log
