# Wafri AI Project Overview

## Elevator pitch
Fatima is a multimodal AI field vet for African farmers: she sees sick animals, speaks local languages, identifies medicines on camera, and places real treatment orders end-to-end over low-bandwidth phones.

## Inspiration
Most livestock farmers in West Africa lose animals because veterinary care is far away, drug instructions are hard to interpret, and many farmers cannot rely on text-heavy apps due to literacy and connectivity barriers.

We wanted to build an AI field vet that works the way farmers already work: point the camera at an animal or medicine bottle, speak naturally in a familiar language, and get practical, safe guidance that leads to a real outcome.

## What it does
Wafri AI introduces Fatima, a real-time multimodal agent that sees, hears, and speaks with farmers like a veterinary assistant in the field.

Farmers can describe symptoms by voice or show animals on camera. Fatima triages the case, explains likely conditions in simple language, and decides whether to recommend treatment products or escalate to nearby clinics.

When a farmer shows an existing medicine bottle or asks for a product, Fatima reads labels, identifies the drug, searches WafriVet inventory, suggests safer or lower-cost options, and places an order linked to the farmer's phone number. Farmers then receive live SMS confirmation.

Farmers can also ask about order history in natural language (for example, "the drug I bought last Wednesday"), and Fatima retrieves current status such as paid, shipped, or delivered.

## How we built it
The frontend is built with Next.js and streams microphone plus camera context into Gemini Live, while rendering Fatima's voice interaction and UI state in real time. Sensitive authentication inputs are handled in secure overlays and not passed through the model.

The backend is FastAPI deployed on Google Cloud Run. It manages one live session per farmer, orchestrates ADK tool-calling for diagnosis, product discovery, clinic escalation, and ordering, and emits real-time updates over WebSockets with Redis pub/sub.

Supabase Postgres stores operational data including farmers, products, distributors, carts, and orders. We combine pgvector and full-text search for robust medicine retrieval and use migration-driven schema updates for safety.

Google Maps Geocoding and Google Places API (New) resolve location and nearest clinics. Termii and Africa's Talking connect the experience to real SMS, voice, and USSD channels for rural conditions.

## Challenges we ran into
The biggest product challenge was making Fatima genuinely agentic rather than scripted: deciding when to diagnose, when to sell, when to ask follow-up questions, and when to escalate to a clinic.

We also had to enforce secure session isolation without full traditional auth from day one. Early cart/session leakage risks required anonymous JWT sessions, phone plus PIN flows, and strict row-level security policies.

Another major challenge was reliability under weak network conditions. We tuned media quality, reconnect behavior, and tool orchestration so the flow remains stable enough for real-world usage and live demo capture.

## Accomplishments that we're proud of
We built a true "see, hear, speak" veterinary agent that can assess a sick chicken from live video, explain likely issues clearly, identify medicine labels on camera, and place a real order quickly.

We completed the end-to-end commerce loop: cart creation, intelligent product selection, order placement, payment-state updates, and instant SMS confirmation in a live conversation.

We also implemented production-minded security and scale foundations, including session controls, phone plus PIN authentication, Redis-backed controls, and row-level data protection.

## What we learned
The strongest AI products are not judged by model complexity alone; they are judged by whether real people can solve urgent problems with confidence.

We learned that multimodal AI becomes significantly more useful when treated as a stateful agent with tools, memory, and constraints, not just a voice wrapper over static endpoints.

We also learned that operational details, such as security, session handling, and resilience, are what transform a compelling prototype into a deployable system.

## What's next for Wafri AI
In the near term, we are expanding language coverage (Pidgin, Hausa, Yoruba, Igbo, and French) and improving triage quality across more livestock species and disease profiles with local veterinary input.

We are integrating additional payment rails and logistics partners so Fatima can autonomously choose the best distributor and delivery pathway per farmer.

Longer term, we will extend access beyond smartphones through USSD and voice-only paths, allowing farmers with basic feature phones to receive fast, AI-powered veterinary support across West Africa.
