---
title: "DX-AgriMarket: Agricultural Digital Operating System (Agri-OS)"
status: draft
created: 2026-08-04
updated: 2026-08-04 (post party-mode review)
project: OpenTea-DX-OS
author: BMad PRD (Fast Path)
source: docs/BA_Document.md
competition: OLP Tin hoc Sinh vien - Phan mem Nguon Mo (VFOSSA)
---

# Product Requirements Document
# DX-AgriMarket: Agricultural Digital Operating System

---

## 1. Executive Summary

**DX-AgriMarket** (Agri-OS) is an open-source Agricultural Digital Operating System built on the **HPDI framework** (Human-Process-Data-Intelligence) defined by VFOSSA's DX-OS standard. It serves Vietnamese agricultural cooperatives (HTX) as a **Single Source of Truth** — automatically aggregating global market, climate, and supply-chain data from public-domain international sources and synthesizing them into Vietnamese-language insights that cooperative managers can act on.

The system is designed to break the information asymmetry that allows middlemen (thuong lai) to exploit cooperatives during price negotiations, and to enable cooperatives to prove product quality and origin to premium buyers via a digital traceability workflow.

> **Core AI Principle (Invariant):** AI in this system **NEVER makes decisions, NEVER recommends actions**. AI **synthesizes facts from multiple sources** and presents them in plain Vietnamese with cited sources. Human actors make all decisions.

**Target:** OLP Tin hoc Sinh vien competition (VFOSSA open-source software track) + production development guide for the OpenTea-DX-OS team.

---

## 2. Problem Statement

### 2.1 Root Cause

Vietnamese agriculture is trapped in the cycle: *"Good harvest = low price; high price = poor harvest."* The root cause is that cooperatives (HTX) make production decisions based on **gut feeling and local information**, lacking a macro view of global supply chains and climate data.

Cooperatives lack a true "operating system" to aggregate global data (Single Source of Truth) and support data-driven decision-making (DDDM). Middlemen hold this information advantage and use it to extract value at the cooperative's expense.

### 2.2 Defined Pain Points

Eight pain points were validated through First Principles brainstorming sessions:

| ID | Pain Point | Primary Actor | Description | Value Delivered |
|----|-----------|---------------|-------------|-----------------|
| PP1 | **Price intelligence** | HTX Manager | HTX is price-squeezed because middlemen have global price data; HTX does not | Break information monopoly |
| PP2 | **Buyer discovery** | HTX Manager | HTX knows only a few familiar middlemen; no channel to find buyers | Expand selling options |
| PP3 | **Quality proof** | Technical Officer | Buyers ask for origin & cultivation records; HTX has nothing to show, loses premium channel deals | Unlock premium channels |
| PP4 | **Multi-plot management** | Technical Officer | Managing dozens of member households, hundreds of land parcels via scattered notebooks/Excel | Digitize farm zone management |
| PP5 | **Information overload / delay** | Farmer | HTX announcements buried in 50-person group chats; farmers miss critical schedules | Deliver right info to right person |
| PP6 | **Plant disease with no expert** | Farmer | Spot disease in the field; cannot reach Technical Officer; wait 2-3 days while it spreads | Early detection, reduce crop loss |
| PP7 | **Imprecise weather** | Farmer | Broadcast weather "rain in Mekong Delta" — farmer needs to know about their specific plot | Plot-level decision making |
| PP8 | **No commodity price visibility** | Farmer | Manager has market chatbot; farmers know nothing; feel disempowered | Transparency and motivation |

> **Scope Boundary:** The system does NOT target self-export by HTX (Vietnamese HTX lack this capacity). The real value is helping HTX **negotiate better with information** and **prove quality to buyers**.

---

## 3. Goals & Success Metrics

### 3.1 Product Goals

| Goal | Description |
|------|-------------|
| **G1 - Information Equity** | Close the price-information gap between HTX and middlemen |
| **G2 - Quality Credibility** | Enable cooperatives to produce verifiable digital traceability for every lot |
| **G3 - Digital Adoption** | Provide a UX simple enough for low-tech users (farmers aged 40-60) |
| **G4 - Open Source Compliance** | 100% MNM (Mien phi Nguon Mo) stack to qualify for OLP competition scoring |
| **G5 - Agronomy Safety Net** | Detect plant diseases faster and ensure pesticide withdrawal compliance before harvest |

### 3.2 Success Metrics

| Metric | Target | Counter-metric |
|--------|--------|----------------|
| Market bulletin generated daily | >=1 bulletin/day per HTX crop profile | Bulletin generation failure rate < 1% |
| Chatbot query latency (Ollama local) | < 5s response time | Irrelevant (out-of-scope) response rate |
| QR lot creation time | < 10 min from harvest approval to QR export | Data auto-fill rate >= 95% (weight/spec excluded) |
| Farming journal compliance | >= 80% of parcels with entries in past 14 days | Officer weekly batch-approval backlog rate |
| Disease diagnosis submission-to-response | Technical Officer responds within 24h | False positive rate on AI diagnosis |
| Farmer notification delivery | 100% via web bell; 0% lost in group chats | Notification read rate |

---

## 4. User Personas

### 4.1 HTX Manager (Truong HTX)

| Attribute | Detail |
|-----------|--------|
| Age | 40-55, elected by member assembly |
| Education | Agriculture, Business Administration, or Economics |
| Devices | Primarily smartphone; rarely uses desktop |
| Tech literacy | Familiar with messaging apps; does not read English charts or international terminology (World Bank, EVFTA) |
| Core responsibility | Lead & direct HTX; negotiate sale prices; find markets; bridge farmers and buyers |
| Pain points addressed | PP1 (price intelligence), PP2 (buyer discovery) |
| Critical UX need | Mobile-first; Vietnamese language; audio readout option |

### 4.2 Technical Officer (Can bo KT/CL)

| Attribute | Detail |
|-----------|--------|
| Age | 30-50, Board member or designated technical lead |
| Role | Only actor who visits fields regularly; monitors crop conditions, coordinates with farmers, oversees quality |
| Current workflow | Notebooks, personal-phone photos, verbal reports to manager |
| Scale challenge | Manages 30-100 member households, hundreds of parcels |
| Pain points addressed | PP3 (quality proof), PP4 (multi-plot management) |
| Critical UX need | Map-based visual overview; batch operations; clear approval workflows |

### 4.3 Farmer - Two Sub-Personas

> **Primary target for HTX kieu moi:** Persona B (Young Farmer) is the primary UX driver. HTX kieu moi operates like a real business — members are younger, digitally comfortable. Persona A (Elder Farmer) is acknowledged and accommodated where easy (TTS, simple flows), but complex accessibility engineering is out of scope for the 2-month timeline.

**Persona A - Elder Farmer (40-60) — Secondary**

| Attribute | Detail |
|-----------|--------|
| Devices | Basic smartphone; primarily calls and texts |
| Tech literacy | Very limited — cannot fill complex forms |
| Journal recording | Reports verbally or via text; Technical Officer digitizes on their behalf |
| UX need | Large text, TTS audio readout; accommodated via simple flows but not primary UX driver |

**Persona B - Young Farmer (20-35) — Primary**

| Attribute | Detail |
|-----------|--------|
| Devices | Good smartphone; digitally comfortable |
| Tech literacy | Comfortable with self-service apps |
| Journal recording | Self-records on web app |
| UX need | Fast, clean, mobile-first UI; self-service; real-time feedback |

---

## 5. System Architecture Overview

The system is structured on the **HPDI (Human-Process-Data-Intelligence)** framework from VFOSSA DX-OS:

```
+---------------------------------------------------------+
|  [H] Human Space -- Next.js Responsive Web + Keycloak  |
|  Three role-specific UIs: Manager | Officer | Farmer   |
+---------------------------------------------------------+
|  [P] Process Space -- n8n Orchestration Engine         |
|  Automated data pipelines + notification routing       |
+---------------------------------------------------------+
|  [D] Data Space -- PostgreSQL + MinIO                  |
|  Market: World Bank + FAOSTAT + WTO Tariff          |
|  Climate: NASA POWER + Open-Meteo                      |
|  HTX Internal: profiles, parcels, journals, lots, docs |
+---------------------------------------------------------+
|  [I] Intelligence Space -- Ollama + Piper TTS + TF/Keras|
|  Cross-source synthesis | TTS audio | Disease detection|
+---------------------------------------------------------+
```

> All components are open-source and MNM-compliant. See Section 8 for full license matrix.

---

## 6. Functional Requirements

Features are organized by actor. Each functional requirement (FR) carries a globally stable ID.

---

### 6.1 HTX Manager Features

#### Feature Group A -- Price Intelligence (PP1)

**FR-A1: Digital Agriculture Market Bulletin**

The system shall automatically generate a daily Vietnamese-language bulletin synthesizing data from multiple international sources (World Bank, WTO Tariff, exchange rates, NASA POWER climate).

- FR-A1.1 -- Generated once daily via automated n8n pipeline and published to the Manager's web dashboard.
- FR-A1.2 -- Displays only data relevant to crop types registered in the HTX Profile. Defaults to all crops when no profile data exists.
- FR-A1.3 -- Presents all data with explicit source citations (e.g., "World Bank, 2026-07-23"). No editorial conclusions or recommendations.
- FR-A1.4 -- Includes a "Listen" button that triggers Piper TTS (voice: `vi_VN-vais1000-medium`, MIT license, local inference) to read a 30-second audio summary aloud.
- FR-A1.5 -- [ASSUMPTION] Bulletin format mirrors familiar Vietnamese broadcast news metaphor (VTV bulletin) -- headline summary + supporting data points -- not an analytics dashboard with raw charts.

**FR-A2: Smart Notification (Market & Cross-Actor)**

The system shall push notifications to the Manager through two channels: n8n connector push (demo: Mattermost) and Web Bell (icon on header).

- FR-A2.1 -- Market notifications: AI evaluates importance based on abnormal variation AND direct financial impact to the HTX -- not a fixed percentage threshold. [ASSUMPTION]
- FR-A2.2 -- Cross-actor notifications: When Technical Officer approves a harvest or exports a QR lot, system automatically sends a web bell notification to Manager. Example: *"Officer Tran Van B approved harvest of Parcel A3 at 14:00 on 20/07."*
- FR-A2.3 -- Market event notifications: pushed real-time. Technical/operational notifications: batched as a Daily Digest to prevent notification spam. [ASSUMPTION: digest grouping logic]
- FR-A2.4 -- Notifications inform only. They are not emergency alerts; users may read or ignore at their discretion.
- FR-A2.5 -- Notification matrix:

| Event | Manager | Technical Officer | Farmer |
|-------|---------|-------------------|--------|
| Market bulletin (price, supply-demand) | bell+push | bell+push | bell+push |
| HTX general announcement | bell+push | bell+push | bell+push |
| Lot packaged / parcel harvest approved | bell+push | (sender) | No |
| Disease report from farmer | bell | bell+push | (sender) |
| Disease diagnosis response | No | (sender) | bell |
| Abnormal weather alert | bell | bell | bell+push |
| Farmer journal pending approval | No | bell | (sender) |
| Journal approval result | No | (sender) | bell |

**FR-A3: Market Expert Chatbot**

The system shall provide a web chat interface for the Manager to ask market and price questions in Vietnamese.

- FR-A3.1 -- Scope: prices, supply-demand comparison, market assessment ONLY.
- FR-A3.2 -- Out of scope for this chatbot: agronomy, legal, administrative topics. System responds with a clear out-of-scope message if asked.
- FR-A3.3 -- AI responses include cross-source synthesis from stored international data (PostgreSQL) and always cite the data source and date.
- FR-A3.4 -- Example interaction:
  - *User:* "Middleman offers 12,000 VND/kg for ST25 rice. Is this reasonable?"
  - *AI:* "Thailand rice output down 15% due to drought (World Bank, 23/07). EU import tariff 0% (WTO/EVFTA). Vietnam FOB export price ~850 USD/tonne = ~20,400 VND/kg. The offered price is 41% below current export price."
- FR-A3.5 -- Chat history retained for 7 days. Users can review prior sessions.
- FR-A3.6 -- Technical stack: Next.js API route -> PostgreSQL query -> Ollama (local) -> response.
- FR-A3.7 -- **Ollama model strategy (dual-environment):**

| Environment | Model | RAM Required | Purpose |
|-------------|-------|-------------|----------|
| Local dev (team machines, 4GB RAM) | Phi-3 Mini 3.8B Q4 | ~2.5GB | Development and testing |
| Server / Demo / Production | Mistral 7B Q4_K_M | ~4.5GB | POF submission and live demo |

  Switch via environment variable `OLLAMA_MODEL`. RAG pipeline and prompt templates are model-agnostic. Quality difference is acceptable for dev; Mistral 7B is the target for all scored/demo contexts.

---

#### Feature Group B -- Buyer Discovery (PP2)

**FR-B1: Agricultural Partner Map**

The system shall provide an interactive map displaying buyers, middlemen, and warehouses.

- FR-B1.1 -- Map base layer: OpenStreetMap (ODbL). Rendering: Leaflet.js / React-Leaflet.
- FR-B1.2 -- Displayed partner types:

| Partner Type | Displayed Information |
|---|---|
| Buyer / Middleman | Name, type, contact (phone or other), primary commodities purchased |
| Warehouse | Name, contact, area (m2) |

- FR-B1.3 -- Add partner: Enter address -> Nominatim autocomplete -> select -> pin on map. No manual coordinate entry.
- FR-B1.4 -- Edit/Delete: Click marker -> popup with info + [Edit] [Delete] buttons. Delete requires confirmation.
- FR-B1.5 -- No filtering by crop type: "Primary commodities" is general metadata, not real-time -- middlemen's buying preferences change daily; filtering would mislead.
- FR-B1.6 -- Seed data with sample partners for OLP demo.
- FR-B1.7 -- [ASSUMPTION] This is a self-managed information tool; HTX contacts partners directly outside the system. No in-app messaging or deal-making.

**FR-B2: Farm Zone Map (Read-Only for Manager)**

The Manager shall be able to view the full HTX farm zone map managed by the Technical Officer.

- FR-B2.1 -- Displays all parcels with color-coded status: Sowing (Green) | Tending (Yellow) | Harvest-Approved (Orange) | Harvested (Blue).
- FR-B2.2 -- Multi-choice filter by parcel status AND/OR crop type simultaneously.
- FR-B2.3 -- Read-only: No CRUD operations. Adding/editing/deleting parcels is the Technical Officer's role.
- FR-B2.4 -- Separate menu item "Farm Zone" -- not mixed with the Partner Map.

**FR-B3: Broadcast Announcement**

- FR-B3.1 -- Manager can send an announcement to all Technical Officers and Farmers.
- FR-B3.2 -- Form: title + body + [Send]. Appears in web bell of all actors.

**FR-B4: Lot List View (Read-Only for Manager)**

- FR-B4.1 -- Table view with lot status filter (Draft / Ready / QR Exported).
- FR-B4.2 -- Click lot -> view QR content detail.
- FR-B4.3 -- Read-only. CRUD is Technical Officer's responsibility.
- FR-B4.4 -- Deep-link: notification "New lot packaged" -> click -> navigates directly to lot detail page.

**FR-B5: HTX Capability Profile Page (Public Storefront)**

- FR-B5.1 -- System auto-generates a public "Capability Page" listing lots with status "Ready" or "QR Exported."
- FR-B5.2 -- Manager shares one URL with buyers instead of individual QR links.
- FR-B5.3 -- [ASSUMPTION] Publicly accessible without login; shows HTX contact info + lot list.

---

### 6.2 Technical Officer Features

#### Feature Group C -- Farm Zone Management (PP4)

**FR-C1: HTX Farm Zone Map (Full CRUD)**

The system shall provide the Technical Officer a full-featured interactive map for managing all HTX farmland.

- FR-C1.1 -- Visualize each parcel on map with crop-type-specific color or icon, owner household, and area.
- FR-C1.2 -- Optional satellite imagery layer: Copernicus Sentinel-2 WMS (CC BY 4.0). Toggle on/off; not required for core function.
- FR-C1.3 -- Draw polygon on map (Leaflet.draw) -> Turf.js auto-calculates area -> HTX Profile aggregates total area automatically.
- FR-C1.4 -- CRUD workflow (sequential): Add household (name, phone) -> Select household -> Draw parcel polygon -> Assign crop type + responsible member.
- FR-C1.5 -- Data per household: Name, phone, list of parcels.
- FR-C1.6 -- Data per parcel: Map polygon, auto-calculated area, current crop, responsible member, unique parcel code.
- FR-C1.7 -- Address search via Nominatim; no manual coordinate entry.
- FR-C1.8 -- Parcel status auto-derived from farming journal (see FR-C2.8). No manual status toggle.
- FR-C1.9 -- Estimated yield: Officer inputs yield-per-area estimate when drawing parcel -> system auto-calculates projected total yield (area x yield rate). Supports Manager's negotiation preparation.
- FR-C1.10 -- Crop cycle concept: When Officer clicks [Approve Harvest] (FR-C2.6), system archives current crop cycle for that parcel. The next "Sowing" journal entry opens a new cycle.

**FR-C2: Digital Farming Journal**

The system shall record all cultivation activities per parcel with a minimum field ruleset.

- FR-C2.1 -- Minimum required fields per journal entry:

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| Date of activity | Yes | Datetime of the activity | 2026-07-20 08:00 |
| Parcel | Yes | Select from registered parcels | Parcel A3 - East Block |
| Activity type | Yes | Fixed dropdown | Sowing / Fertilizing / Spraying / Irrigation / Harvest / Other |
| Activity detail | Yes | Specific description | "NPK 20-20-15, 50kg per 1000m2" |
| Performed by | Yes | Who carried it out | Nguyen Van A |
| Product name used | When spraying/fertilizing | Chemical or fertilizer name | Regent 800WG |
| Dosage | When spraying/fertilizing | Amount + unit | 50ml / 16L pump |
| Withdrawal period (days) | When spraying | As labeled on container | 14 days |
| Notes | Optional | Additional info | "Leaves showing yellowing" |
| Weather | Auto | System fetches from Open-Meteo | Sunny, 32C, humidity 75% |

- FR-C2.2 -- Who records:
  - Technical Officer self-records -> auto-approved (Officer is the approver).
  - Young Farmer self-records -> status "Pending Approval."
  - Elder Farmer: reports verbally/via text -> Officer digitizes on their behalf -> auto-approved.
- FR-C2.3 -- **Approval cycle: weekly batch** -- Farmers submit entries anytime; Officer reviews batch once per week.
- FR-C2.4 -- Batch approval UX: Officer goes to "Pending Journals" -> filter by household -> select multiple entries -> [Approve All] or edit individual entries.
- FR-C2.5 -- Weather auto-attach: Each entry fetches and stores Open-Meteo data for the entry date. Officer may backdate entries; system calls Open-Meteo Historical API for backdated date.
- FR-C2.6 -- No-pesticide rule: If parcel has no "Spraying" entry -> system displays "No pesticide used" + auto-marks withdrawal as PASSED + QR records "No pesticide used."
- FR-C2.7 -- n8n automated reminder: Every Friday afternoon, n8n sends the Officer a notification to batch-approve pending journals. Parcel progress bar alerts if no journal update for >14 days.
- FR-C2.8 -- **Parcel status auto-derivation from journal** (no manual toggle):

| Condition | Status | Color |
|-----------|--------|-------|
| Has "Sowing" entry, no care entries yet | Sowing | Green |
| Has fertilizing / irrigation / spraying entry | Tending | Yellow |
| Officer clicked [Approve Harvest] | Harvest-Approved | Orange |
| Has "Harvest" entry OR lot created from parcel | Harvested | Blue |

Status resets to Sowing when a new "Sowing" entry begins a new crop cycle.

**FR-C3: QR Code Traceability -- 6-Step Workflow**

The system shall generate product-origin QR codes from data captured through the daily workflow. The Officer enters only weight and packaging specification at QR generation time.

**Step 1 -- Farm Zone Setup (Once)**
Officer draws farm map: parcels, crop assignments, member households -> data stored.

**Step 2 -- Daily Journal Recording**
Farmers (and Officer) log activities with minimum ruleset (FR-C2). All cultivation history captured.

**Step 3 -- Pre-Harvest Inspection**

- FR-C3.1 -- System automatically calculates and displays withdrawal status for each parcel:
  ```
  Parcel A3 - East Block
  Last spray date:     2026-07-06
  Chemical:            Regent 800WG
  Required withdrawal: 14 days
  Today:               2026-07-21
  Days elapsed:        15 days
  Status:              PASSED (15 >= 14)

  [Approve Harvest]
  ```
- FR-C3.2 -- Officer clicks [Approve Harvest] -> system records: approver (auto from login), approval date (auto = today), parcel status -> "Harvest-Approved."

**Step 4 -- Lot Consolidation (After Harvest)**

- FR-C3.3 -- Officer creates a new lot:
  - Selects from parcels with "Harvest-Approved" status only (system enforces).
  - Chooses quality grade: Grade 1 / Grade 2 (optional).
  - Weight: NOT entered yet (not yet weighed).
  - Lot created in "Draft" status.
  - System auto-fills: lot code (see FR-C3.9), packaging date (today), commodity (from parcel), harvest date (from journal).

**Step 5 -- Pre-Review & Finalization**

- FR-C3.4 -- System displays full QR content preview. All fields auto-filled; Officer can edit any field if needed.
- FR-C3.5 -- Weight and Packaging Spec are the only mandatory manual inputs. [Export QR] button disabled until both are filled.
- FR-C3.6 -- [Save Draft] -> saves and allows return later to complete.
- FR-C3.7 -- Officer may attach certificates from P.A.R.A document store (VietGAP, OCOP, lab test) via dropdown select.

**Step 6 -- QR Generation**

- FR-C3.8 -- System generates unique QR code containing a URL to the public traceability page. Lot transitions: Draft -> QR Exported.
- FR-C3.9 -- Lot code auto-format: `[HTX Code]-[Crop]-[Harvest Date]-[Sequence]`. Example: `MD2-ST25-20260720-001`.

**Lot Status Table:**

| Status | Description | Transition |
|--------|-------------|------------|
| Draft | Lot created, weight/spec pending | -> Ready (when fully filled) |
| Ready | Fully reviewed, ready for QR | -> QR Exported |
| QR Exported | QR generated; record locked | Terminal state |

**Public QR Scan Page -- 4-Block Structure:**

| Block | Displayed Data | Data Source | Manual Input at QR Time |
|-------|----------------|-------------|--------------------------|
| 1. Product & Lot | Lot code, commodity, packaging date | Auto from parcel attributes & lot creation date | 0% (Auto) |
| | Total weight, packaging specification | Manual entry in Step 5 | 100% (Manual) |
| 2. Origin | HTX name & contact | Auto from HTX Profile | 0% (Auto) |
| | Farming household, parcel location | Auto from parcel metadata (set during farm setup) | 0% (Auto) |
| | Approving officer | Auto from login session (Step 3) | 0% (Auto) |
| 3. Journal & Safety | Safety status (withdrawal PASSED) | Auto-calculated from last spray entry (Step 3) | 0% (Auto) |
| | Cultivation timeline (Sowing -> Harvest) | Auto-loaded from parcel journal JSON array | 0% (Auto) |
| 4. Certifications | Link to PDF certificates (VietGAP, OCOP, lab) | Selected from P.A.R.A MinIO (dropdown only) | 0% (Select only) |

**FR-C4: P.A.R.A Document Management**

- FR-C4.1 -- Storage: MinIO (AGPL v3, self-hosted). Interface: folder-view in Next.js.
- FR-C4.2 -- Upload, view, download documents.
- FR-C4.3 -- P.A.R.A structure:
  - **Projects:** Season-specific documents (e.g., Summer-Autumn 2026 campaign)
  - **Areas:** Ongoing operational docs (cultivation SOPs, HTX bylaws)
  - **Resources:** Reference materials (agronomy guides, fertilizer price lists)
  - **Archives:** Historical records (completed season reports)
- FR-C4.4 -- Documents in MinIO serve as RAG source for the Technical Chatbot (FR-C5).
- FR-C4.5 -- Certificates stored here are selectable in QR lot creation (Step 5, FR-C3.7).

**FR-C5: Technical Expert Chatbot**

- FR-C5.1 -- Scope: Cultivation techniques, HTX operational documents, crop season processes.
- FR-C5.2 -- Out of scope: Market prices (that is the Manager's chatbot).
- FR-C5.3 -- RAG source: Documents stored in P.A.R.A MinIO.
- FR-C5.4 -- Chat history retained for 7 days.
- FR-C5.5 -- Technology: Same Ollama instance; different system prompt and RAG pipeline from Market Chatbot.

**FR-C6: Technical Announcement to Farmers**

- FR-C6.1 -- Form: title + body + recipient selector (all farmers / specific households) + checkbox [Also notify Manager] + [Send].
- FR-C6.2 -- Example: "Scheduled collective spraying on 25/07 -- all ST25 rice parcels, East Zone."

---

### 6.3 Farmer Features

#### Feature Group D -- Daily Farm Intelligence (PP5 + PP7 + PP8)

**FR-D1: "Today" Dashboard**

The system shall provide a unified daily overview screen as the landing page for all actors. Content is role-scoped.

Farmer-specific content:

- FR-D1.1 -- Plot-level weather: Open-Meteo data by parcel coordinates.
- FR-D1.2 -- Commodity price: Only the crop type being farmed, single number + trend arrow. **Domestic price data is deterministically mock for OLP** — no MNM-compliant real-time domestic commodity price source exists in Vietnam. This is a fixed architectural decision, not a temporary assumption. Mock data is seeded with realistic values for demo. Post-OLP real-time sourcing is a future roadmap item beyond 10/9.
- FR-D1.3 -- My Parcels: Current status of farmer's own parcels and current crop cycle phase.
- FR-D1.4 -- New Notifications: Personal inbox -- not a group chat; notifications delivered directly and do not get buried.
- FR-D1.5 -- Disease Diagnosis quick-access button -> links to FR-F1.
- FR-D1.6 -- Disease Journal link -> read-only list of disease records for farmer's own household.
- FR-D1.7 -- "Listen" button: Piper TTS reads the entire dashboard aloud (for elder farmers).

Manager and Officer also have role-scoped "Today" dashboards:

- Manager dashboard: all-HTX bulletin summary, partner map quick access, lot status count.
- Officer dashboard: parcels needing action (pending approvals, overdue journals), disease reports to review.

---

#### Feature Group E -- Notifications (PP5)

**FR-E1: Notification System (n8n + Web Bell)**

All three actors receive notifications via two complementary channels.

- FR-E1.1 -- **Web Bell**: Bell icon in header across all role UIs. Click to see latest notification list.
- FR-E1.2 -- **n8n push connector**: Mattermost for demo; other connectors deployable per real-world setup. Channel-agnostic core -- no platform lock-in.
- FR-E1.3 -- Accessibility: "Listen" button beside each notification item (Piper TTS).
- FR-E1.4 -- Notification delivery rights:
  - Manager -> sends down to Officer + Farmers (Broadcast, FR-B3).
  - Officer -> sends down to Farmers (Technical announcement, FR-C6).
  - Farmer -> sends UP to Officer only via specific features (disease report FR-F1, journal submission FR-G1). Farmers cannot broadcast.

---

#### Feature Group F -- Plant Disease Detection (PP6)

**FR-F1: AI-Powered Disease Diagnosis**

The system shall allow farmers to photograph a diseased plant and receive an AI disease prediction.

- FR-F1.1 -- Farmer taps "Diagnose Disease" -> camera or gallery upload.
- FR-F1.2 -- Farmer selects the relevant parcel from their own parcel list (dropdown).
- FR-F1.3 -- Upload -> TensorFlow/Keras model (Apache 2.0, self-trained) inference via Python FastAPI -> returns disease name + confidence percentage.
- FR-F1.4 -- If confidence < 60%: Display warning "Image may not be clear enough; consider retaking" -- still allows submission.
- FR-F1.5 -- System always displays: "This is an AI prediction; confirmation by Technical Officer required before taking action."
- FR-F1.6 -- [Send to Technical Officer] -> triggers notifications:
  - Officer receives: "Farmer A suspects disease 'Rice Blast' at Parcel A3 [View image]"
  - Manager also receives web bell notification (cross-actor visibility).
- FR-F1.7 -- Officer views submission -> confirms or corrects diagnosis -> records to parcel's **Disease Journal** (separate from farming journal).
- FR-F1.8 -- Treatment recommendation: OUT OF SCOPE. Officer advises via external channels (call/message) or sends a manual Technical Announcement. System does not suggest treatments.
- FR-F1.9 -- **Offline handling (PWA capability)**: Farmer photographs and selects parcel offline -> system caches payload with GPS snapshot taken at photo moment -> auto-uploads when connectivity restored. GPS is locked at photo capture time, not at upload time.

Disease Journal structure:
- Entries: detection date, parcel, original photo, AI result (disease + %), detected-by (farmer), confirmed-by (officer), treatment notes (freetext, entered by officer).
- Officer view: all HTX disease records, filterable by household/parcel.
- Farmer view: read-only, their household's records only.

---

#### Feature Group G -- Farmer Journal Submission (PP4 partial)

**FR-G1: Farming Journal Entry (Young Farmer)**

Young farmers shall be able to self-record journal entries for their own parcels.

- FR-G1.1 -- Farmer sees only their own assigned parcels (not all HTX parcels).
- FR-G1.2 -- Records activity using same minimum ruleset as Officer (FR-C2.1).
- FR-G1.3 -- Submit -> entry moves to "Pending Approval" status + farmer ID attached.
- FR-G1.4 -- While "Pending Approval": Farmer can click [Withdraw] to revise and resubmit.
- FR-G1.5 -- Officer batch-approves weekly (FR-C2.3-C2.4). Entry auto-fills into parcel's official journal after approval.
- FR-G1.6 -- After "Approved": Farmer view is read-only.
- FR-G1.7 -- Elder farmers: Not expected to use this feature -- they report verbally; Officer inputs on their behalf.

---

### 6.4 Cross-Cutting Features

#### Feature Group H -- Authentication & Platform

**FR-H1: Authentication**

- FR-H1.1 -- Primary: **Passkeys (WebAuthn)** via Keycloak built-in support. Login with fingerprint / Face ID / device PIN -- zero cost, 100% open-source, highest security.
- FR-H1.2 -- Fallback: Phone number + 6-digit static PIN.
- FR-H1.3 -- OTP screen displays: "OTP code is valid for 5 minutes."
- FR-H1.4 -- Role-based access: Three roles in Keycloak -- `Manager`, `Officer`, `Farmer`. Each role sees a distinct UI.
- FR-H1.5 -- Keycloak handles all auth; Next.js uses NextAuth.js with Keycloak OIDC adapter.

**FR-H2: HTX Profile**

- FR-H2.1 -- Fields: HTX name, address, registered crop types, total area, current season.
- FR-H2.2 -- Initial entry: Manual input allowed.
- FR-H2.3 -- Auto-update: Once Officer draws parcels on farm map -> Turf.js aggregates total area -> Profile syncs.
- FR-H2.4 -- Market bulletin and notifications filter by crop types in Profile. Partner Map is NOT filtered.
- FR-H2.5 -- When no crop profile exists: Bulletin and notifications default to showing all available data.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| NFR | Requirement |
|-----|-------------|
| Ollama chatbot response latency | < 10s on demo server (CPU-only, Mistral 7B Q4_K_M); < 5s on GPU-enabled hardware; ~3-5s local dev with Phi-3 Mini on 4GB RAM |
| TTS generation (Piper, local) | **MVP (30/8):** On-demand at button press. **Post-30/8:** Nightly cronjob (04:00) pre-generates bulletin audio for performance optimization |
| Open-Meteo API rate limit | n8n polls once per hour, stores to PostgreSQL -- no direct client-side API calls |
| Map rendering | Leaflet.js renders 200+ parcel polygons without UI freeze |
| QR scan page | Public page load < 2 seconds (static render from pre-generated data) |

### 7.2 Availability & Reliability

| NFR | Requirement |
|-----|-------------|
| System deployment | Self-hosted via Docker Compose on team-controlled server |
| AI graceful degradation | If Ollama is unavailable: bulletin displays raw data without AI synthesis; chatbot displays maintenance message |
| TTS graceful degradation | If Piper TTS job fails: "Listen" button hidden, text-only fallback |
| Offline support | PWA cache for disease photo capture + GPS snapshot; auto-upload on reconnect |

### 7.3 Security

| NFR | Requirement |
|-----|-------------|
| Authentication | Keycloak + WebAuthn (Passkeys); zero SMS cost |
| Authorization | Role-based (Manager / Officer / Farmer) enforced server-side |
| Data isolation | Farmer can only access own parcel data; Officer accesses all HTX data |
| Public QR page | No login required; exposes only pre-approved, explicitly published lot data |
| MinIO storage | Internal network only; accessed via pre-signed URLs for document downloads |

### 7.4 Accessibility

| NFR | Requirement |
|-----|-------------|
| TTS coverage | "Listen" button on: Dashboard, notifications, diagnosis results, market bulletin |
| Font size | Farmer UI: larger base font size; minimal button count per screen |
| Language | All UI in Vietnamese; all AI output in Vietnamese with international source citations |

### 7.5 Scalability & Maintainability

| NFR | Requirement |
|-----|-------------|
| Architecture | Microservices-ready via Docker Compose; each service independently restartable |
| Data sources | n8n workflows are the sole integration point -- swap/add APIs without touching application code |
| AI model updates | Disease model updated by swapping FastAPI model file; no full redeploy required |
| Notification connectors | n8n connector pattern; add new channels (Telegram, email) without changing core |

---

## 8. Open Source License Compliance Matrix

> Critical criterion for OLP Tin hoc Sinh vien scoring. All components must be MNM (Mien phi Nguon Mo) compliant.

| Architecture Layer | Component | License | OLP Compliance |
|---|---|---|---|
| H -- Presentation | Next.js, React | MIT | Pass |
| H -- Security | Keycloak | Apache 2.0 | Pass |
| H -- Map | OpenStreetMap | ODbL | Pass |
| H -- Map rendering | Leaflet.js, React-Leaflet | BSD-2 | Pass |
| H -- Map search | Nominatim | ODbL | Pass |
| H -- Map draw + area | Leaflet.draw + Turf.js | MIT | Pass |
| H -- QR generation | node-qrcode | MIT | Pass |
| P -- Orchestration | n8n | Faircode | Pass (DX-OS approved) |
| D -- Database | PostgreSQL | PostgreSQL License | Pass |
| D -- File storage | MinIO | AGPL v3 | Pass *(used as-is, no source modifications — copyleft condition not triggered)* |
| D -- Market data | World Bank API | CC BY 4.0 | Pass (open data) |
| D -- Trade data | WTO Tariff API, World Bank WITS | CC BY 4.0 | Pass |
| D -- Agri statistics | FAOSTAT API | CC BY 4.0 | Pass |
| D -- Climate data | NASA POWER API | Public Domain | Pass (copyright-free) |
| D -- Weather (micro) | Open-Meteo API | Open-Meteo License (free) | Pass |
| D -- Exchange rates | ExchangeRate-API | Free/Standard | Pass |
| D -- Satellite imagery | Copernicus Sentinel-2 WMS | CC BY 4.0 | Pass (optional layer) |
| I -- AI engine | Ollama | MIT | Pass |
| I -- TTS engine | Piper TTS (vi_VN-vais1000-medium) | MIT | Pass |
| I -- Notification | n8n + Mattermost connector | Faircode + MIT | Pass |
| I -- Disease model | TensorFlow / Keras | Apache 2.0 | Pass |
| I -- Model API | FastAPI (Python) | MIT | Pass |

**All 22 components: 100% MNM compliant. No proprietary dependencies.**

---

## 9. Out of Scope

| Item | Reason |
|------|--------|
| HTX self-export to international markets | Vietnamese HTX lack the operational and legal capacity; reframed to "negotiate better" |
| AI treatment recommendations for plant diseases | High complexity, agronomy expertise risk; diagnosis name is sufficient; officer advises externally |
| Real-time commodity price for farmers | FOB export prices not actionable at farm level; mock domestic data sufficient |
| Native mobile app (iOS/Android) | 2-month timeline constraint; responsive web + PWA extension is the strategy |
| Administrative / financial management | Payroll, accounting, member equity -- separate domain |
| Internal HTX conflict resolution tools | Out of system scope; managed by leadership |
| Legal document generation | HTX contracts, compliance filings -- separate domain |
| AI recommendation of buy/sell timing | Violates core AI principle (no decisions, no recommendations) |
| Multi-HTX federation / super-admin | Single-HTX instance; federation not in scope for MVP |

---

## 10. Phased Implementation Roadmap

Timeline: **2 months (04/08 – 10/09/2026)**. Strategy: **Integration over building** — leverage open-source components; build only what's unique.

**Key milestones:**
- **30/08/2026** — Source code submission for POF (MNM compliance scoring). MVP must be live and demonstrable.
- **10/09/2026** — Final product deadline. Remaining features completed and polished.

**Team:** 3 members, all working across all features. Task assignment via GitHub Issues. BMAD ecosystem used for planning and documentation.

**Critical path (sequential, cannot parallelize):** Farm Zone Map → Farming Journal → QR Traceability

**Demo narrative order:** Manager story (Bulletin + Chatbot + Partner Map) → Officer story (Farm Zone + Journal + QR scan)

---

### MVP SCOPE — Target: 30/08/2026 (POF Submission)

#### Phase 1 -- Foundation (Days 1-5)

**Goal:** Infrastructure live; users can log in; HTX Profile works; data starts flowing automatically.

| # | Feature | Layer | Notes |
|---|---------|-------|-------|
| 1a | Docker Compose full stack (Keycloak, n8n, PostgreSQL, Ollama, Piper TTS, FastAPI) | Infra | Blocker for all other phases |
| 1b | Auth (Keycloak + Passkeys/PIN) + Role-based UI routing | H | |
| 1c | HTX Profile (manual entry; auto-aggregate from map later) | H+D | |
| 1d | n8n data pipeline: World Bank, WTO, ExchangeRate, Open-Meteo -> PostgreSQL | P+D | |

#### Phase 2A -- Core Value: Manager (Days 6-12)

**Goal:** Data on screen; AI bulletin works; chatbot live; partner map up.

| # | Feature | Layer | Notes |
|---|---------|-------|-------|
| 2 | Market Bulletin + Piper TTS on-demand audio | H+I | Phi-3 Mini local / Mistral 7B server |
| 3 | Market Expert Chatbot (Ollama RAG from PostgreSQL) | H+I | |
| 4 | Agricultural Partner Map CRUD (Leaflet + Nominatim) | H+D | Seed demo data |
| 4b | Web Bell notification (basic, all actors) | H | Mattermost push deferred to post-30/8 |

#### Phase 2B -- Core Value: Technical Officer (Days 10-22) *(overlaps 2A)*

**Goal:** Farm zone and traceability workflow complete. This is the critical path.

| # | Feature | Layer | Notes |
|---|---------|-------|-------|
| 5 | Farm Zone Map + CRUD (households + parcels + crop assignment) | H+D | **Critical path start** |
| 6 | Digital Farming Journal (Officer self-record + batch approve) + Weather auto-attach | H+D | **Critical path middle** |
| 7 | QR Traceability Workflow (6 steps) + Public scan page | H+D | **Critical path end** |
| 8 | Disease FastAPI backend (silent deploy, no Farmer UI) | I | Model already trained from prior OLP |

#### POF Submission Checklist (Days 23-26)

| Item | Description |
|------|-------------|
| README.md | Full tech stack + license for every component |
| docker-compose.yml | Annotated with image versions and licenses |
| License Matrix | Match Section 8 of this PRD |
| Model notes | Ollama model and Piper TTS voice downloaded separately (not bundled); download links documented |
| robots.txt | Public QR scan page excluded from search engine indexing |

---

### POST-30/8 SCOPE — Target: 10/09/2026

#### Phase 2C -- Core Value: Farmer

**Goal:** Farmers have their own tools; reduce dependency on verbal information.

| # | Feature | Layer | Notes |
|---|---------|-------|-------|
| 9 | "Today" Dashboard (all 3 roles) | H | Young Farmer (Persona B) is primary UX target |
| 10 | Notification Inbox (personal, non-drowning) | H+P | |
| 11 | Disease Diagnosis Farmer UI (connects to already-deployed FastAPI) | H+I | Backend live since 30/8 |
| 12 | Farmer Journal Submission UI | H+D | |
| 13 | Broadcast Announcement UI (Manager) | H | |
| 14 | Mattermost external push connector (n8n) | P | |
| 15 | n8n weekly batch-approve reminder (Friday cronjob) | P | |
| 16 | P.A.R.A Document Store (MinIO) + Technical Chatbot | D+I | |
| 17 | Piper TTS nightly cronjob (performance optimization) | I | |

#### Phase 3 -- Extensions (Post-10/9 or If Time Permits Before)

| # | Feature | Notes |
|---|---------|-------|
| 18 | Smart Notification (AI-evaluated importance) | n8n + AI importance scoring |
| 19 | Public HTX Capability Page (Storefront) | Auto-generated from lot data |
| 20 | Copernicus Sentinel-2 satellite overlay | Optional visual enhancement |
| 21 | PWA offline + GPS snapshot for disease diagnosis | Critical for real-world field use |

---

## 11. Demo Scenarios (OLP Presentation)

> **Demo Principle:** AI always presents facts with citations. NEVER demos AI saying "you should" or "you should not."

**Scenario 1 -- PP1: Price Intelligence**
Manager opens web on phone. Sees today's bulletin on ST25 rice market. Taps "Listen" -> hears 30-second audio summary. Opens chatbot: "Middleman offers 12,000 VND/kg. Is this price fair?" AI responds: "Thailand rice output down 15% (World Bank). EU tariff 0% (EVFTA). Vietnam FOB export price ~20,400 VND/kg. The offered price is 41% below current export price." Manager has the data to negotiate.

**Scenario 2 -- PP2: Buyer Discovery**
Manager opens partner map -> sees 5 buyer companies, 3 middlemen, 2 warehouses in the region. Taps "Loc Troi" -> sees phone number, primary crops purchased. Calls to negotiate directly.

**Scenario 3 -- PP3+4: Quality Proof**
Officer opens farm zone map -> sees 120 parcels color-coded. Taps Parcel A3 -> views 10 journal entries (sowing through spraying). System shows withdrawal status: 15 days >= 14 days -> PASSED -> Officer approves harvest. Consolidates into lot `MD2-ST25-20260720-001` -> system generates QR. Buyer scans QR -> sees full history: which HTX, who farmed, what was sprayed and when, weather records -> trusts quality -> pays premium price.

**Scenario 4 -- PP6: Disease Emergency**
Farmer Minh in the field spots unusual brown spots on rice leaves. Opens web -> taps "Diagnose Disease" -> photographs leaf -> selects Parcel A3. AI returns: "Rice Blast -- 95% confidence." Farmer taps [Send to Technical Officer]. Officer Tran Van B receives notification immediately. Officer confirms diagnosis -> records to disease journal -> replies to farmer.

---

## 12. Open Questions & Assumptions

### Resolved Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-1 | Ollama model selection | **RESOLVED** — Dual-model: Phi-3 Mini 3.8B Q4 for local dev (4GB RAM machines); Mistral 7B Q4_K_M for server/demo. Switch via `OLLAMA_MODEL` env var. |
| OQ-2 | Disease model availability | **RESOLVED** — Model is self-trained by team and has already competed in a prior OLP round. Available and proven. FastAPI deploy before 30/8. |
| OQ-3 | Server specification | **RESOLVED** — Server has 64GB RAM, 24-core/48-thread CPU, no dedicated GPU. Team uses a shared portion (est. 16-20GB RAM available). CPU-only Ollama inference. |
| OQ-4 | Mattermost deployment | **RESOLVED** — Needs fresh setup. Deferred to post-30/8 scope. Web Bell is the only notification channel for MVP. |
| OQ-5 | Public QR page indexing | **RESOLVED** — robots-excluded. Privacy-first; not indexed by search engines. |

### Resolved Architectural Assumptions

| ID | Assumption | Status |
|----|-----------|--------|
| A-1 | Market bulletin format = Vietnamese broadcast news style (not analytics dashboard) | Confirmed — validated in BA |
| A-2 | Market notification threshold = AI-evaluated (not fixed %) | Confirmed — validated in BA |
| A-3 | Domestic commodity price for Farmers = deterministically mock for OLP | **Architectural decision** — no MNM-compliant real-time domestic price source exists in Vietnam. Not a debt. |
| A-4 | Disease diagnosis = name + confidence only; no treatment recommendations | Confirmed — validated in BA and party review |
| A-5 | HTX Capability Page is publicly accessible without login | Confirmed — deferred to post-10/9 roadmap |
| A-6 | Daily Digest grouping for operational notifications | Deferred — n8n notification routing is post-30/8 scope |
| A-7 | MinIO used as-is, no source modifications | Confirmed — AGPL v3 copyleft condition not triggered |
| A-8 | TTS on-demand for MVP; cronjob optimization post-30/8 | Confirmed — simpler for 26-day sprint |
| A-9 | Young Farmer (Persona B) is primary UX target for HTX kieu moi | Confirmed — Elder Farmer accommodated where easy but not primary UX driver |

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| HTX | Hop tac xa -- Agricultural cooperative |
| MNM | Mien phi Nguon Mo -- Free and Open Source |
| OLP | Olympiad Tin hoc Sinh vien -- Vietnam Student Informatics Olympiad |
| HPDI | Human-Process-Data-Intelligence -- DX-OS architecture framework |
| DX-OS | Digital Transformation Operating System -- VFOSSA framework |
| Truong HTX | HTX Manager / Director |
| Can bo KT/CL | Technical and Quality Officer |
| P.A.R.A | Projects-Areas-Resources-Archives document management system |
| RAG | Retrieval-Augmented Generation -- AI technique using documents as context |
| FOB | Free On Board -- export pricing term |
| World Bank | World Bank Open Data (Pink Sheet / Indicators) |
| Turf.js | JavaScript library for geospatial analysis (area calculation from polygons) |
| Nominatim | OpenStreetMap geocoding API (address -> coordinates) |
| Piper TTS | Open-source text-to-speech engine (MIT license) |
| Ollama | Local LLM inference engine (MIT license) |
| WebAuthn | Web Authentication standard -- foundation for Passkeys |
