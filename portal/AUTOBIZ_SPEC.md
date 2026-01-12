# AutoBiz - Complete Product Specification

> Reference document for building the AutoBiz automated business system.
> This document persists across Claude sessions.

---

## 1. Product Overview

### Vision
AutoBiz enables small businesses (≤5 people) to run their entire operation on autopilot using pre-built automations that connect all business functions.

### Target User
- Small business owners (1-5 employees)
- Non-technical or semi-technical
- Want things to "just work"
- Value time over customization

### Core Principle
**Business Units → Processes → Automations**

Not tool-first, but business-first. We automate what businesses actually do.

---

## 2. Business Unit Structure

### CORE (Base Package)
All 6 units included - this IS the business.

| Unit | Role | Icon |
|------|------|------|
| Sales | Revenue generation | 💼 |
| Operations | Value delivery | ⚙️ |
| Finance | Money management | 💰 |
| Admin | Central hub (connects all units) | 🔗 |
| Marketing | Awareness & lead gen | 📣 |
| Customer Service | Retention & satisfaction | 🎧 |

### ADD-ONS (Optional Enhancements)
Things a business can live without but would benefit from.

| Add-on | Enhances | Icon |
|--------|----------|------|
| Social Media Automation | Marketing | 📱 |
| AI Content Writer | Marketing | ✍️ |
| AI Auto-responder | Customer Service | 🤖 |
| Review Management | Customer Service | ⭐ |
| Advanced Analytics | All | 📊 |
| Price Monitoring | Sales/Ops | 💹 |
| Inventory Automation | Operations | 📦 |
| Multi-currency | Finance | 💱 |
| Team Collaboration | Admin | 👥 |
| API Integrations | Admin | 🔌 |
| White-label Bio | Marketing | 🏷️ |
| SMS Notifications | All | 📲 |

---

## 3. Business Unit Details

### 3.1 SALES

**Purpose:** Find leads, convert to customers, grow revenue.

**Processes:**
| Process | Description | Automation Level |
|---------|-------------|------------------|
| Lead Capture | Collect enquiries from all sources | Full |
| Lead Qualification | Score/filter serious vs time-wasters | Full (AI) |
| CRM Management | Track all contacts & interactions | Partial |
| Proposal/Quote Generation | Create & send quotes | Full |
| Follow-up Sequences | Nurture until decision | Full |
| Pipeline Tracking | Know where each deal stands | Full |
| Contract/Closing | Finalize the sale | Partial |

**Workflows:**

#### SALES-001: Lead Capture
```
Trigger: Form submission / Email received / API webhook
Actions:
  1. Parse incoming data (name, email, phone, source, message)
  2. Check for duplicates in CRM
  3. Create/update contact in CRM
  4. Tag with source (website, referral, social, etc.)
  5. Trigger SALES-002 (qualification)
  6. Send acknowledgment email to lead
  7. Log activity
Tools: n8n, CRM, Email
```

#### SALES-002: Lead Qualification
```
Trigger: New contact created in CRM
Actions:
  1. Pull contact data
  2. AI analysis of message/enquiry
  3. Score lead (1-10) based on:
     - Budget indicators
     - Urgency signals
     - Fit with services
  4. Categorize: Hot / Warm / Cold
  5. Update CRM tags
  6. Route based on score:
     - Hot (8-10): Immediate notification to owner
     - Warm (5-7): Add to nurture sequence
     - Cold (1-4): Add to long-term list
  7. Log qualification result
Tools: n8n, Brain (AI), CRM
```

#### SALES-003: Auto Follow-up Sequence
```
Trigger: Lead not converted after X days (configurable)
Actions:
  1. Check current status in CRM
  2. If still open:
     - Day 1: Initial follow-up email
     - Day 3: Value-add email (tip/resource)
     - Day 7: Check-in email
     - Day 14: Final attempt
     - Day 21: Move to long-term nurture
  3. Track opens/clicks
  4. Update CRM with engagement
  5. If reply detected → Alert owner
Tools: n8n, CRM, Email
```

#### SALES-004: Quote Generator
```
Trigger: Manual request / CRM stage change to "Quote"
Actions:
  1. Pull client data from CRM
  2. Pull service/product catalog
  3. Generate quote document (PDF)
  4. Apply branding
  5. Email to client
  6. Update CRM stage
  7. Schedule follow-up reminder (3 days)
Tools: n8n, CRM, Converter, Email
```

#### SALES-005: Pipeline Alerts
```
Trigger: Deal stage change / Deal value threshold
Actions:
  1. Determine alert type:
     - New hot lead
     - Deal moving forward
     - Deal stalled (no activity X days)
     - Deal won
     - Deal lost
  2. Notify relevant person(s)
  3. Update analytics dashboard
  4. If deal won → Trigger OPERATIONS-001 (job intake)
  5. If deal lost → Trigger feedback request
Tools: n8n, CRM, Analytics
```

---

### 3.2 OPERATIONS

**Purpose:** Deliver the product/service efficiently and consistently.

**Processes:**
| Process | Description | Automation Level |
|---------|-------------|------------------|
| Job/Order Intake | Receive and log new work | Full |
| Scheduling | Book time, assign resources | Partial |
| Task Management | Track what needs doing | Partial |
| Delivery/Fulfillment | Execute the work | Manual |
| Quality Checks | Ensure standards met | Partial |
| Inventory Management | Track stock (if applicable) | Full |
| Supplier Coordination | Manage vendors | Partial |

**Workflows:**

#### OPS-001: Job Intake
```
Trigger: Deal won in CRM / Manual creation
Actions:
  1. Create job record with:
     - Client details (from CRM)
     - Service/product details
     - Value & payment terms
     - Deadline/due date
  2. Assign to team member (round-robin or manual)
  3. Create task checklist from template
  4. Send confirmation to client
  5. Notify assigned team member
  6. Block calendar if applicable
  7. Update workload dashboard
Tools: n8n, CRM, Calendar
```

#### OPS-002: Scheduling
```
Trigger: New job created / Reschedule request
Actions:
  1. Check team availability
  2. Check resource availability
  3. Propose available slots
  4. If client-facing: Send booking link
  5. Once confirmed:
     - Create calendar event
     - Send confirmations (client + team)
     - Set reminders (24hr, 1hr before)
Tools: n8n, Calendar, CRM
```

#### OPS-003: Status Updates
```
Trigger: Job status change / Scheduled interval
Actions:
  1. Detect status change:
     - Started
     - In Progress (% complete)
     - On Hold
     - Completed
  2. Notify client via preferred channel
  3. Update CRM record
  4. If On Hold → Alert manager with reason
  5. Log status history
Tools: n8n, CRM, Email/SMS
```

#### OPS-004: Delivery Confirmation
```
Trigger: Job marked as completed
Actions:
  1. Send delivery confirmation to client
  2. Attach any deliverables/documents
  3. Update CRM status
  4. Trigger FINANCE-001 (invoice)
  5. Schedule CUST-002 (feedback request) for +3 days
  6. Update analytics (job completed)
  7. If recurring → Schedule next occurrence
Tools: n8n, CRM, Converter
```

#### OPS-005: Resource/Capacity Alerts
```
Trigger: Workload threshold reached / Schedule conflict
Actions:
  1. Calculate current capacity utilization
  2. If >80% utilization:
     - Alert manager
     - Suggest load balancing
  3. If resource conflict:
     - Alert affected parties
     - Propose alternatives
  4. Weekly capacity report
Tools: n8n, Analytics
```

---

### 3.3 FINANCE

**Purpose:** Manage money in, money out, and financial visibility.

**Processes:**
| Process | Description | Automation Level |
|---------|-------------|------------------|
| Invoicing | Create & send invoices | Full |
| Payment Collection | Track & chase payments | Full |
| Expense Tracking | Log costs | Partial (AI assist) |
| Bank Reconciliation | Match transactions | Partial |
| Cash Flow Reporting | Know money position | Full |
| P&L Reporting | Profit visibility | Full |
| Tax Preparation | Compliance ready | Partial |

**Workflows:**

#### FIN-001: Auto Invoice
```
Trigger: Job completed / Milestone reached / Manual
Actions:
  1. Pull job/order details from CRM
  2. Calculate amounts:
     - Line items
     - Tax
     - Discounts
     - Total
  3. Generate invoice (PDF)
  4. Apply branding & terms
  5. Email to client
  6. Log in CRM
  7. Set payment due date
  8. Schedule FIN-002 (reminder) for due date
Tools: n8n, CRM, Converter, Email
```

#### FIN-002: Payment Reminders
```
Trigger: Invoice age milestones (3, 7, 14, 30 days overdue)
Actions:
  1. Check if payment received
  2. If not paid:
     - Day 3: Friendly reminder
     - Day 7: Second reminder
     - Day 14: Urgent notice
     - Day 30: Final notice + escalate
  3. Personalize based on client history
  4. Track email opens
  5. Update CRM with reminder sent
  6. If payment received → Cancel remaining reminders
Tools: n8n, CRM, Email
```

#### FIN-003: Payment Received
```
Trigger: Bank webhook / Manual entry / Payment gateway
Actions:
  1. Match payment to invoice
  2. Mark invoice as paid
  3. Send thank you / receipt to client
  4. Update CRM
  5. Update cash flow dashboard
  6. If partial payment → Adjust remaining balance
  7. Log transaction
Tools: n8n, CRM, Analytics, Bank integration
```

#### FIN-004: Expense Capture
```
Trigger: Email with receipt / Photo upload / Manual
Actions:
  1. AI extract data from receipt:
     - Vendor
     - Amount
     - Date
     - Category (auto-suggest)
  2. Create expense record
  3. Attach original receipt
  4. Categorize for tax purposes
  5. Update expense dashboard
  6. If >threshold → Request approval
Tools: n8n, Brain (AI), Analytics
```

#### FIN-005: Weekly Financial Report
```
Trigger: Schedule (Monday 8am)
Actions:
  1. Pull week's data:
     - Revenue received
     - Invoices sent
     - Outstanding receivables
     - Expenses logged
     - Net cash flow
  2. Compare to previous week
  3. Generate report
  4. Email to owner
  5. Update dashboard
Tools: n8n, Analytics, Email
```

---

### 3.4 ADMIN (Central Hub)

**Purpose:** Connect all units, manage documents, ensure compliance.

**Processes:**
| Process | Description | Automation Level |
|---------|-------------|------------------|
| Document Management | Store & organize files | Full |
| Cross-Unit Coordination | Route info between units | Full |
| Compliance Tracking | Legal, regulatory deadlines | Full |
| Internal Communications | Team notifications | Full |
| System Administration | Tool management | Partial |

**Workflows:**

#### ADMIN-001: Document Filing
```
Trigger: New document received / created
Actions:
  1. AI analyze document type:
     - Contract
     - Invoice
     - Receipt
     - Proposal
     - Report
     - Other
  2. Extract metadata (date, client, value)
  3. Auto-name with convention
  4. File in correct folder
  5. Index for search
  6. Link to relevant CRM record
  7. Notify relevant person if needed
Tools: n8n, Brain (AI), Converter, Storage
```

#### ADMIN-002: Cross-Unit Router
```
Trigger: Events from any unit
Actions:
  1. Receive event (sale, job complete, payment, etc.)
  2. Determine downstream actions:
     - Sale won → Create job (OPS)
     - Job complete → Create invoice (FIN)
     - Payment received → Update job status (OPS)
     - Complaint → Create ticket (CUST)
  3. Route to appropriate workflow
  4. Log in central activity feed
  5. Update master dashboard
Tools: n8n
```

#### ADMIN-003: Compliance Reminders
```
Trigger: Schedule / Date approaching
Actions:
  1. Check compliance calendar:
     - Tax deadlines
     - License renewals
     - Contract renewals
     - Insurance expiry
     - Certifications
  2. Send reminders at:
     - 30 days before
     - 7 days before
     - Day of
  3. Track completion
  4. Escalate if missed
Tools: n8n, Calendar
```

#### ADMIN-004: Daily Business Digest
```
Trigger: Schedule (8am daily)
Actions:
  1. Aggregate from all units:
     - New leads (Sales)
     - Jobs in progress (Ops)
     - Invoices due (Finance)
     - Open tickets (Customer Service)
     - Tasks for today
  2. Compile digest
  3. Send to owner/team
  4. Highlight urgent items
Tools: n8n, Analytics, Email
```

#### ADMIN-005: Team Notifications
```
Trigger: Any critical event across units
Actions:
  1. Determine notification priority:
     - Critical: Immediate (all channels)
     - High: Within 1 hour
     - Normal: Daily digest
  2. Determine recipients
  3. Send via appropriate channel:
     - Email (default)
     - SMS (critical)
     - In-app (if available)
  4. Log notification sent
Tools: n8n, Email, SMS
```

---

### 3.5 MARKETING

**Purpose:** Generate awareness, attract leads, build brand.

**Processes:**
| Process | Description | Automation Level |
|---------|-------------|------------------|
| Email Campaigns | Newsletters, promotions | Full |
| Content Distribution | Share content | Partial |
| Website/Bio Management | Online presence | Partial |
| Campaign Analytics | Track what works | Full |
| Lead Nurturing | Warm up prospects | Full |

**Workflows:**

#### MKT-001: Welcome Email
```
Trigger: New customer (deal won)
Actions:
  1. Send welcome email series:
     - Day 0: Welcome + what to expect
     - Day 3: Tips for success
     - Day 7: Check-in
  2. Add to customer list
  3. Remove from prospect list
  4. Update CRM tags
Tools: n8n, CRM, Email
```

#### MKT-002: Newsletter Sender
```
Trigger: Schedule (monthly) / Manual
Actions:
  1. Pull subscriber list from CRM
  2. Segment by tags (customers, prospects, etc.)
  3. Pull newsletter content
  4. Personalize greeting
  5. Send in batches
  6. Track opens/clicks
  7. Update engagement scores
Tools: n8n, CRM, Email
```

#### MKT-003: Bio Page Updates
```
Trigger: Content change / Manual
Actions:
  1. Update bio page content
  2. Refresh any dynamic data
  3. Clear cache
  4. Notify owner of update
  5. Log change history
Tools: n8n, Bio
```

#### MKT-004: Campaign Tracking
```
Trigger: Link click / Email open / Form submit
Actions:
  1. Log engagement event
  2. Update contact's engagement score
  3. Tag with campaign source
  4. If high engagement → Notify sales
  5. Update campaign dashboard
Tools: n8n, CRM, Analytics
```

---

### 3.6 CUSTOMER SERVICE

**Purpose:** Support customers, handle issues, maintain satisfaction.

**Processes:**
| Process | Description | Automation Level |
|---------|-------------|------------------|
| Support Tickets | Handle issues | Partial |
| FAQ/Self-Service | Common questions | Full (AI) |
| Feedback Collection | Reviews, surveys | Full |
| Complaint Handling | Resolve problems | Partial |
| Customer Retention | Keep them coming back | Partial |

**Workflows:**

#### CUST-001: Support Ticket
```
Trigger: Email to support / Form submission
Actions:
  1. Create ticket in CRM
  2. AI categorize issue type
  3. AI check for immediate answer (FAQ)
  4. If FAQ match → Send auto-reply
  5. If not → Assign to team member
  6. Send acknowledgment with ticket #
  7. Set SLA timer
  8. If SLA breached → Escalate
Tools: n8n, Brain (AI), CRM
```

#### CUST-002: Feedback Request
```
Trigger: Job completed + 3 days
Actions:
  1. Send satisfaction survey
  2. Collect rating (1-5 stars)
  3. Collect comments
  4. Log in CRM
  5. If rating ≥4:
     - Trigger CUST-003 (review request)
  6. If rating ≤2:
     - Alert manager immediately
     - Create priority ticket
  7. Update customer health score
Tools: n8n, CRM
```

#### CUST-003: Review Request
```
Trigger: Positive feedback received (4+ stars)
Actions:
  1. Wait 1 day
  2. Send review request email
  3. Include links to:
     - Google Business
     - Facebook
     - Industry-specific sites
  4. Track if review posted
  5. Send thank you if review detected
Tools: n8n, CRM
```

#### CUST-004: Complaint Escalation
```
Trigger: Negative feedback / Angry keyword detected / Manual
Actions:
  1. Create priority ticket
  2. Alert manager immediately
  3. Pull customer history
  4. Suggest resolution based on:
     - Issue type
     - Customer value
     - Past issues
  5. Track resolution time
  6. Follow up after resolution
Tools: n8n, Brain (AI), CRM
```

---

## 4. Data Flow Between Units

```
                    ┌─────────────┐
                    │   ADMIN     │
                    │   (Hub)     │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SALES     │────▶│ OPERATIONS  │────▶│  FINANCE    │
│             │     │             │     │             │
│ Lead →      │     │ Job →       │     │ Invoice →   │
│ Qualify →   │     │ Schedule →  │     │ Payment →   │
│ Quote →     │     │ Deliver →   │     │ Report      │
│ Close       │     │ Confirm     │     │             │
└──────┬──────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│  MARKETING  │     │  CUSTOMER   │
│             │     │  SERVICE    │
│ Nurture     │     │             │
│ Newsletter  │     │ Support     │
│ Bio         │     │ Feedback    │
│ Campaigns   │     │ Reviews     │
└─────────────┘     └─────────────┘
```

### Key Handoffs:
1. **SALES → OPERATIONS**: Deal won triggers job creation
2. **OPERATIONS → FINANCE**: Job complete triggers invoice
3. **FINANCE → ADMIN**: Payment received updates dashboard
4. **OPERATIONS → CUSTOMER SERVICE**: Delivery triggers feedback request
5. **CUSTOMER SERVICE → SALES**: Happy customer triggers referral request
6. **MARKETING → SALES**: Campaign response triggers lead

---

## 5. Technical Implementation

### Data Acuity Tools Used

| Tool | Primary Use | Units |
|------|-------------|-------|
| CRM | Contact & deal management | All |
| n8n | Workflow automation | All |
| Brain (AI) | Content generation, analysis | Sales, Finance, Admin, Cust |
| Analytics (Superset) | Dashboards, reports | All |
| Bio | Online presence | Marketing |
| Converter | Document generation | Sales, Finance, Admin |
| Markets | Price monitoring | Add-on |

### CRM Fields Required

**Contact:**
- name, email, phone
- source (how they found us)
- lead_score (1-10)
- lead_status (hot/warm/cold)
- customer_status (prospect/customer/churned)
- engagement_score
- tags[]

**Deal:**
- contact_id
- value
- stage (lead/qualified/quoted/negotiating/won/lost)
- expected_close_date
- notes

**Job:**
- deal_id
- contact_id
- status (pending/scheduled/in_progress/completed/cancelled)
- assigned_to
- scheduled_date
- completed_date
- deliverables[]

**Invoice:**
- job_id
- contact_id
- amount
- status (draft/sent/paid/overdue)
- due_date
- paid_date

**Ticket:**
- contact_id
- type (support/complaint/feedback)
- priority (low/medium/high/critical)
- status (open/in_progress/resolved/closed)
- assigned_to
- sla_due

---

## 6. Setup/Onboarding Flow

### Step 1: Business Info
- Business name
- Industry type
- Number of employees
- Primary service/product

### Step 2: Contact Info
- Owner name
- Owner email
- Owner phone
- Business email (for sending)

### Step 3: Connect CRM
- Authenticate with Data Acuity CRM
- Or connect external (HubSpot, etc.)

### Step 4: Configure Units
For each unit, basic questions:

**Sales:**
- Lead sources to track?
- Follow-up frequency?
- Quote template choice?

**Operations:**
- Service-based or product-based?
- Typical job duration?
- Team members to assign?

**Finance:**
- Payment terms (days)?
- Currency?
- Tax rate?

**Admin:**
- Notification preferences?
- Daily digest time?

**Marketing:**
- Website URL?
- Social links?

**Customer Service:**
- Support email?
- SLA targets?

### Step 5: Deploy
- Create all workflows in n8n
- Configure triggers
- Set up dashboards
- Send test notifications

### Step 6: Go Live
- Activate workflows
- Monitor first 24 hours
- Provide quick-start guide

---

## 7. Success Metrics

### Per Unit KPIs

**Sales:**
- Lead response time
- Qualification accuracy
- Quote-to-close rate
- Follow-up completion rate

**Operations:**
- On-time delivery rate
- Resource utilization
- Job completion time

**Finance:**
- Invoice send time (after job complete)
- Days sales outstanding (DSO)
- Payment collection rate

**Admin:**
- Cross-unit routing accuracy
- Compliance deadline adherence

**Marketing:**
- Email open/click rates
- Lead-to-customer rate

**Customer Service:**
- First response time
- Resolution time
- CSAT score
- Review rate

---

## 8. Pricing Considerations (Future)

### Potential Tiers

**Starter:** R499/month
- All 6 core units
- Basic workflows
- 1 user

**Growth:** R999/month
- All 6 core units
- All workflows
- 3 users
- 2 add-ons included

**Business:** R1999/month
- All 6 core units
- All workflows
- 10 users
- All add-ons included
- Priority support

### Add-on Pricing
- Per add-on: R99-299/month depending on complexity

---

## 9. Development Roadmap

### Phase 1: Foundation
- [x] AutoBiz page in portal
- [ ] Sales unit workflows (5)
- [ ] Sales setup wizard
- [ ] Testing & refinement

### Phase 2: Core Complete
- [ ] Operations unit workflows (5)
- [ ] Finance unit workflows (5)
- [ ] Admin unit workflows (5)
- [ ] Cross-unit integration testing

### Phase 3: Full Business
- [ ] Marketing unit workflows (4)
- [ ] Customer Service unit workflows (4)
- [ ] End-to-end testing
- [ ] Dashboard creation

### Phase 4: Add-ons
- [ ] Social Media Automation
- [ ] AI Content Writer
- [ ] AI Auto-responder
- [ ] Advanced Analytics
- [ ] (Additional add-ons)

### Phase 5: Polish
- [ ] Onboarding wizard
- [ ] Documentation
- [ ] Video tutorials
- [ ] Support materials

---

## 10. Document History

| Date | Author | Changes |
|------|--------|---------|
| 2024-12-03 | Claude | Initial specification created |

---

*This document is the single source of truth for AutoBiz development.*
