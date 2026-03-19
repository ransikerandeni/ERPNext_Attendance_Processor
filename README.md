# Attendance Processor

> A Frappe/ERPNext app for **University of Colombo School of Computing (UCSC)** that analyses employee attendance records, identifies documentation gaps, sends personalised email summaries to employees, and provides leave-approver dashboards — all tightly integrated with ERPNext HR.

---

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration & Setup](#configuration--setup)
   - [Email Settings](#1-email-settings)
   - [Employee Records](#2-employee-records)
   - [Shift Configuration](#3-shift-configuration)
   - [Scheduled Jobs](#4-scheduled-jobs)
5. [Desk Pages](#desk-pages)
   - [Attendance Summary Report](#attendance-summary-report)
   - [Approver Summary](#approver-summary)
6. [User Guide](#user-guide)
   - [Attendance Summary Report (HR / System Manager)](#attendance-summary-report-hr--system-manager)
   - [Approver Summary (Leave Approvers)](#approver-summary-leave-approvers)
   - [Automated Weekly & Monthly Emails](#automated-weekly--monthly-emails)
7. [Business Rules & Issue Classification](#business-rules--issue-classification)
8. [Role & Permission Matrix](#role--permission-matrix)
9. [Uninstalling](#uninstalling)

---

## Features

| Feature | Description |
|---|---|
| **Attendance Analysis** | Scans ERPNext Attendance records and cross-checks them against filed applications to detect gaps |
| **4-Check Issue Detection** | Missed Attendance Requests · Leave Applications · Short Leave Applications · Two Late → Half Day conversions |
| **Personalised Email Summaries** | HTML email sent to each employee listing only their outstanding items |
| **Weekly & Monthly Scheduled Emails** | Automatic background jobs send summaries for the previous week and previous month |
| **Attendance Summary Report** | Interactive desk page for HR to preview results, filter by employee or date range, and trigger bulk email sends |
| **Approver Summary** | Desk page for leave approvers to see all pending applications belonging to their direct reports, grouped by type |
| **Role-Based Access** | System Managers and HR Managers see all data; leave approvers see only their own team |

---

## Prerequisites

- **Frappe Framework** v15 or later
- **ERPNext** v15 or later (with the HR module enabled)
- The following custom DocTypes must exist in the ERPNext database (created by your site administrator):
  - `Missed Attendance Request`
  - `Short Leave Application`
  - `Two Late Attendance To One Half Day`
- The `Attendance` DocType must have the following custom fields:
  - `custom_ucsc_status` (Select — mirrors the standard `status` field for UCSC payroll)
  - `custom_remarks` (Small Text — used to classify Half Day sub-types)
- Python ≥ 3.10
- An outbound email account configured in ERPNext (required for email features)

---

## Installation

### 1 — Get the app

```bash
bench get-app https://github.com/ransikerandeni/ERPNext_Attendance_Processor.git
```

Or, if you already have the repository cloned locally:

```bash
bench get-app attendance_processor /path/to/local/clone
```

### 2 — Install on your site

```bash
bench --site <your-site-name> install-app attendance_processor
```

### 3 — Run database migration

```bash
bench --site <your-site-name> migrate
```

### 4 — Build front-end assets

```bash
bench build --app attendance_processor
```

### 5 — Restart the bench

```bash
bench restart
```

After these steps the app is live. Navigate to your ERPNext desk to access the new pages.

---

## Configuration & Setup

### 1. Email Settings

The app sends HTML emails via Frappe's standard email queue.

1. In ERPNext go to **Settings → Email Account**.
2. Ensure at least one **outgoing** email account is configured and enabled.
3. Verify the **Employee** records have a valid email address in the **Company Email** or **Personal Email** field — the app uses whichever `frappe.db.get_value("Employee", id, "prefered_email")` resolves to.

### 2. Employee Records

Each employee must have the following fields populated for the analysis to work correctly:

| Field | Why it is needed |
|---|---|
| **Status** = Active | Only active employees are analysed |
| **Leave Approver** | Used by the Approver Summary to group applications |
| **Department** | Displayed in all summary tables |
| **Shift** | Required for Two Late → Half Day shift-window calculations |
| **Preferred / Company Email** | Destination address for automated email summaries |

### 3. Shift Configuration

Two Late → Half Day detection relies on shift arrival windows defined in `utils/processor.py`:

| Shift | Valid late-arrival window |
|---|---|
| Shift-A | 09:00:00 – 09:15:59 |
| Shift-C | 08:30:00 – 08:45:59 |

If your organisation uses different shifts or time windows, update the `SHIFT_WINDOWS` dictionary in `attendance_processor/utils/processor.py` and restart the bench.

**Monthly limits** (also in `processor.py`):

| Constant | Default | Meaning |
|---|---|---|
| `SHORT_LEAVE_MONTHLY_LIMIT` | 2 | Maximum short-leave allowance per employee per calendar month |
| `TWO_LATE_MONTHLY_LIMIT` | 2 | Maximum Two Late applications per employee per calendar month |

### 4. Scheduled Jobs

The app ships two scheduled jobs. To enable automatic email dispatching, add the following to `hooks.py` in the app:

```python
scheduler_events = {
    "weekly": [
        "attendance_processor.scheduler.send_weekly_attendance_summary"
    ],
    "monthly": [
        "attendance_processor.scheduler.send_monthly_attendance_summary"
    ],
}
```

Then run `bench restart` for changes to take effect.

| Function | Recommended Schedule | Description |
|---|---|---|
| `attendance_processor.scheduler.send_weekly_attendance_summary` | Weekly (Monday morning) | Sends email summaries for the previous Mon–Sun week |
| `attendance_processor.scheduler.send_monthly_attendance_summary` | Monthly (1st of the month) | Sends email summaries for the previous calendar month |

---

## Desk Pages

All pages are accessible only to authenticated ERPNext users. Navigating directly to any URL will redirect unauthenticated visitors to the login page.

| Page | URL | Access |
|---|---|---|
| Attendance Processor Home | `/app/attendance-processor-home` | All authenticated users |
| Attendance Summary Report | `/app/attendance-summary-report` | System Manager, HR Manager |
| Approver Summary | `/app/approver-summary` | System Manager, HR Manager, Department Head Attendance Appr |

> **Example full URLs** (replace `<your-site>` with your actual site domain, e.g. `ucsctest_site.com`):
> - `https://<your-site>/app/attendance-processor-home`
> - `https://<your-site>/app/attendance-summary-report`
> - `https://<your-site>/app/approver-summary`

### Attendance Processor Home

The Home page is the recommended entry point for all users. It displays role-aware cards that link to the pages the current user is permitted to access. The **Attendance Summary Report** card is visible to all users; the **Approver Summary** card is shown only to System Managers and users with the `Department Head Attendance Appr` role.

---

## User Guide

### Attendance Summary Report (HR / System Manager)

**Navigate to:** ERPNext Desk → *Attendance Processor Home* → **Attendance Summary Report** card
or go directly to `/app/attendance-summary-report`
(full URL: `https://<your-site>/app/attendance-summary-report`)

This page is the primary HR dashboard for reviewing and acting on attendance issues.

#### Filter Bar

| Control | Description |
|---|---|
| **Period** | Quick preset selector: Last Week, Last Month, This Week, This Month, Custom |
| **From Date** | Start of the analysis window (inclusive) |
| **To Date** | End of the analysis window (inclusive) |
| **Add Employee** | Type-ahead link field — add one or more employees to restrict the analysis to specific people |

Selected employees appear as coloured tag pills below the filter bar. Click **×** on a pill to remove a single employee, or **Clear all** to reset.

#### Generating a Report

1. Select a date range using the **Period** preset or enter dates manually.
2. Optionally filter to specific employees using the **Add Employee** field.
3. Click **Preview Report** (primary action button).
4. Results load immediately into the page — one card per employee, sorted by total issue count (highest first).

#### Reading the Results

Each employee card shows:

- **Issue count badge** — total outstanding items for the period
- **Colour-coded chips** — quick counts per issue type:
  - 🔴 Missed Attendance Requests
  - 🟠 Leave Applications
  - 🔵 Short Leave Applications
  - 🟣 Two Late → Half Day
- **Collapsible detail tables** — click any section header to expand or collapse it; each table shows attendance date, status, in/out times, shift, and remarks

#### Sending Emails (System Manager only)

The **Send Emails** button (visible only to System Managers) opens a confirmation dialog. On confirmation, an asynchronous background job is queued that sends personalised HTML emails to every listed employee. The page does not block while emails are being sent.

---

### Approver Summary (Leave Approvers)

**Navigate to:** ERPNext Desk → *Attendance Processor Home* → **Approver Summary** card
or go directly to `/app/approver-summary`
(full URL: `https://<your-site>/app/approver-summary`)

This page lets leave approvers review all **pending** applications belonging to their direct reports in one place.

#### Role-Based Filtering

| Role | What is visible |
|---|---|
| System Manager or HR Manager | All approvers and their pending applications |
| Any other authenticated user | Only the applications where the logged-in user is the assigned leave approver |

#### Generating an Approver Summary

1. The page auto-generates results for the current month on first load.
2. Adjust **From Date** and **To Date** as needed.
3. Click **Generate Summary**.

#### Reading the Results

Each approver card shows:

- **Approver name** and total pending count badge
- Summary chips per application type
- Expandable tables for:
  - **Missed Attendance Requests**
  - **Leave Applications**
  - **Short Leave Applications**
  - **Two Late Attendance → One Half Day**
- Each application row contains a clickable **ID link** that opens the document directly in the ERPNext desk

#### Applications included

Only non-cancelled (`docstatus != 2`) records with the following statuses are shown:

- Leave Applications: `Open` or `Approved`
- All other types: any status except cancelled

---

### Automated Weekly & Monthly Emails

When the scheduled jobs are enabled (see [Scheduled Jobs](#4-scheduled-jobs)), employees automatically receive an HTML email summarising their outstanding attendance items for:

- **The previous Monday–Sunday week** (weekly job)
- **The previous calendar month** (monthly job)

The email contains:

- A colour-coded table for each issue category
- Date, status, in/out times, shift, and remarks for every flagged record
- Instructions to submit the appropriate applications through ERPNext

Employees with **no outstanding items** receive a "no issues found" confirmation email. Errors per employee are logged individually in the Frappe Error Log and do not abort the batch — the remaining employees are still processed.

---

## Business Rules & Issue Classification

The analysis engine (`utils/processor.py`) applies the following checks in order for every **non-weekend**, **non-cancelled** attendance record that is not already linked to an application:

| Check | Trigger condition | Issue type raised |
|---|---|---|
| **1 — Missed Attendance** | One punch present, the other missing (in XOR out) | `Missed Attendance Request` |
| **2 — Leave Application (absent)** | Status = Absent, no in/out times, no existing leave cover | `Leave Application` |
| **2b — Leave Application (half day)** | Status = Half Day, remarks contain `"Half Day"` but not `"Short Leave"`, not covered by leave/short-leave/two-late | `Leave Application` |
| **3 — Short Leave** | Remarks contain `"Half Day / Short Leave"`, not already filed, within the monthly short-leave limit (default 2) | `Short Leave Application` |
| **4 — Two Late → Half Day** | Same as check 3 but the employee arrived within the configured shift late-arrival window AND promotion limit not yet reached (default 2 per month) | Promoted to `Two Late Attendance To One Half Day`; reverts to Short Leave if only one such record exists in the month |
| **Overflow** | Short Leave / Two Late limit already exhausted for the month | `Leave Application` (overflow) |

---

## Role & Permission Matrix

| Feature | System Manager | HR Manager | Leave Approver | Employee |
|---|---|---|---|---|
| Attendance Summary Report — view | ✅ | ✅ | ❌ | ❌ |
| Attendance Summary Report — send emails | ✅ | ❌ | ❌ | ❌ |
| Approver Summary — view all approvers | ✅ | ✅ | ❌ | ❌ |
| Approver Summary — view own team | ✅ | ✅ | ✅ | ❌ |
| Automated email recipient | ✅ | ✅ | ✅ | ✅ (if active) |

---

## Uninstalling

```bash
bench --site <your-site-name> uninstall-app attendance_processor
bench --site <your-site-name> migrate
bench restart
```

> **Note:** Uninstalling removes the app's desk pages and Python code but does **not** drop custom DocTypes (`Missed Attendance Request`, `Short Leave Application`, `Two Late Attendance To One Half Day`) or custom fields added to `Attendance`. Remove those manually through ERPNext's Customise Form if required.

---

#### License

MIT

---

*Developed and maintained by the [University of Colombo School of Computing (UCSC)](https://ucsc.cmb.ac.lk) ERP team — erp@ucsc.cmb.ac.lk*