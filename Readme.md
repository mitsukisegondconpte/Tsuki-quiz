# WhatsApp Quiz Bot

## Overview

This is a WhatsApp bot built with Baileys that hosts interactive quiz games in group chats. The bot generates quiz questions dynamically using OpenRouter AI (with models like Mistral), supports multiple game modes (solo/team), various categories (anime, sports, general knowledge, etc.), and maintains question history to avoid repetition. The bot connects to WhatsApp via QR code or pairing code authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Components

**Bot Entry Point (index.js)**
- Initializes WhatsApp connection using Baileys library
- Handles authentication via multi-file auth state (stored in `auth_info/` directory)
- Supports both QR code scanning and pairing code connection methods
- Uses environment variable `WHATSAPP_NUMBER` for pairing code flow

**Quiz Management (quizzes/quizManager.js)**
- Manages active quiz sessions using a Map keyed by group JID
- Handles message routing and command parsing
- Supports quick commands like `!quiz [mode] [category] [language] [level]`
- Validates user inputs for mode (solo/team), category, and language
- Tracks quiz state per group to prevent overlapping sessions

**AI Question Generation (quizzes/quizAPI.js)**
- Integrates with OpenRouter API for dynamic question generation
- Uses environment variables for API key and model selection
- Generates questions in specified language with proper JSON formatting
- Maintains per-group question history in JSON files under `history/` directory
- Prevents question repetition by passing history context to AI prompts

**Message Utilities (utils/sendMessageWA.js)**
- Wrapper for sending WhatsApp messages with optional buttons
- Uses stephtech-ui library for interactive button messages
- Falls back to plain text if button rendering fails
- Supports mentions for tagging users

### Design Patterns

**Session Management**: Quiz sessions are stored in-memory using JavaScript Map, with group JID as the key. This allows multiple groups to run independent quizzes simultaneously.

**History Persistence**: Question history is persisted to filesystem as JSON files, enabling the bot to remember previously asked questions across restarts.

**Graceful Degradation**: The message sending utility attempts rich UI with buttons first, then falls back to plain text on failure.

### Authentication Flow

The bot uses Baileys' multi-file auth state, which persists credentials to the `auth_info/` directory. On first run, users can either scan a QR code or use a pairing code (if phone number is provided via environment variable).

## External Dependencies

### Third-Party Services

**OpenRouter API**
- Purpose: AI-powered quiz question generation
- Configuration: `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` environment variables
- Default model: `mistralai/devstral-2512:free`

**WhatsApp Web (via Baileys)**
- Purpose: WhatsApp messaging platform connection
- Library: @whiskeysockets/baileys
- Authentication: Multi-file auth state stored locally

### NPM Packages

| Package | Purpose |
|---------|---------|
| @whiskeysockets/baileys | WhatsApp Web API client |
| @hapi/boom | HTTP error handling |
| axios | HTTP client for API requests |
| dotenv | Environment variable management |
| pino | Logging framework |
| stephtech-ui | WhatsApp UI components (buttons) |
| qrcode-terminal | QR code display for authentication |

### Environment Variables Required

```
OPENROUTER_API_KEY=<your-api-key>
OPENROUTER_MODEL=<optional-model-name>
WHATSAPP_NUMBER=<optional-for-pairing-code>
```

### File Storage

- `auth_info/`: WhatsApp authentication credentials
- `history/`: Per-group question history JSON files