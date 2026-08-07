# Stream Scout Pro

Build a full-stack web application called StreamScout AI.

Purpose:
StreamScout AI is a personal AI assistant that helps a promoter scout Twitch and Kick streamers, analyze their channels, manage conversations, and generate replies that convert them into promotion clients.

The app must function as a workspace dashboard where the user can analyze streamer channels, store conversations, and generate AI replies using two personas: a friendly scout and a professional promoter.

MAIN FEATURES

Streamer Channel Analyzer

The app must allow the user to paste a Twitch or Kick channel link.

When a link is submitted, the system should:

• Extract the channel username
• Analyze the channel’s performance
• Estimate key metrics such as:

follower count

average viewers

stream consistency

engagement level

growth potential

The AI should then generate a detailed but easy-to-read analysis including:

• Current growth stage (new streamer, small creator, affiliate-level, etc.)
• Main problems slowing growth
• Opportunities for improvement
• Why the streamer would benefit from promotion and audience growth services

The analysis must end with suggested outreach messages.

AI Conversation Assistant

The app must include an AI chat assistant that helps the user respond to streamers.

User workflow:
• User pastes conversation messages from Discord, Twitch, or Kick.
• AI reads the conversation.
• AI suggests the best reply.

The assistant must continue conversations naturally and help move the conversation toward a promotion opportunity.

Dual Persona Mode

The assistant must have a persona switcher with two modes.

Mode 1: Friend Mode (Nifimas)

Tone:
• friendly
• casual
• supportive
• curious

Goal:
Build trust with the streamer and understand their struggles.

Typical behavior:
• ask about their streaming journey
• show genuine interest
• discuss growth challenges
• avoid sounding salesy

Mode 2: Promoter Mode (Brozeen)

Tone:
• confident
• professional
• knowledgeable

Goal:
Present promotion services and convert the streamer into a client.

Typical behavior:
• explain growth problems
• position promotion as a solution
• highlight benefits of increased viewers and discoverability
• suggest next steps for working together

Conversation Inbox

The app should include a conversation management system.

Users should be able to:

• create a new streamer contact
• attach their Twitch or Kick channel link
• store conversation history
• reopen conversations later

Each conversation page should show:

• streamer name
• platform
• channel link
• previous messages
• AI reply suggestions

Re-engagement Assistant

If a streamer stops replying, the AI should suggest follow-up messages.

Examples:

• friendly check-ins
• asking about their latest stream
• offering quick tips
• restarting the conversation naturally

Knowledge Base

The app must include a knowledge base where the user can store:

• outreach scripts
• conversion strategies
• objection handling
• growth tips for streamers

The AI should reference this knowledge base when generating replies.

USER INTERFACE

Design a modern dashboard layout.

Sections:

Dashboard
Streamer Analyzer
Conversation Inbox
AI Chat Assistant
Knowledge Base
Settings

Design style:

• dark theme
• clean modern interface
• sidebar navigation
• workspace style similar to productivity tools

STREAMER ANALYSIS OUTPUT FORMAT

When analyzing a streamer channel, show:

Streamer Overview

Followers:
Estimated Average Viewers:
Streaming Frequency:
Growth Stage:

Channel Strengths

Channel Weaknesses

Growth Opportunities

Promotion Potential

Suggested Message (Friend Mode)

Suggested Message (Promoter Mode)

AI BEHAVIOR

The assistant must always:

• be helpful
• generate clear and natural messages
• adapt to the selected persona
• help move conversations toward collaboration or promotion opportunities

GOAL OF THE APP

StreamScout AI should help the user:

• scout streamers faster
• analyze their channels instantly
• manage outreach conversations
• generate replies that build trust
• convert streamers into promotion clients

Create this as a responsive full-stack web application with a clean dashboard interface and integrated AI assistant.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://scout-nurture-convert.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f4505cf5-a65a-4552-903a-2683b302803f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
