# Attendance Processor

> A Frappe/ERPNext app for **University of Colombo School of Computing (UCSC)** that analyses employee attendance records, identifies documentation gaps, sends personalised email summaries to employees, and provides leave-approver dashboards — all tightly integrated with ERPNext HR.

---

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Updating the App](#updating-the-app)
5. [Configuration & Setup](#configuration--setup)
   - [Email Settings](#1-email-settings)
   - [Employee Records](#2-employee-records)
   - [Shift Configuration](#3-shift-configuration)
   - [Attendance Processor Settings](#4-attendance-processor-settings)
   - [Scheduled Jobs](#5-scheduled-jobs)
6. [Desk Pages](#desk-pages)
   - [Attendance Processor Home](#attendance-processor-home)
   - [Attendance Summary Report](#attendance-summary-report)
   - [HR Report](#hr-report)
   - [Approver Summary](#approver-summary)
   - [Leave Balance Report](#leave-balance-report)
7. [User Guide](#user-guide)
   - [Attendance Summary Report (HR / System Manager)](#attendance-summary-report-hr--system-manager)
   - [HR Report (HR User / System Manager)](#hr-report-hr-user--system-manager)
   - [Approver Summary (Leave Approvers)](#approver-summary-leave-approvers)
   - [Leave Balance Report (HR / System Manager)](#leave-balance-report-hr--system-manager)
   - [Automated Weekly & Monthly Emails](#automated-weekly--monthly-emails)
8. [Business Rules & Issue Classification](#business-rules--issue-classification)
9. [Role & Permission Matrix](#role--permission-matrix)
10. [Uninstalling](#uninstalling)

---

## Features

| Feature | Description |
|---|---|
| **Attendance Analysis** | Scans ERPNext Attendance records and cross-checks them against filed applications to detect gaps |
| **4-Check Issue Detection** | Missed Attendance Requests · Leave Applications · Short Leave Applications · Two Late → Half Day conversions |
| **Rapid Tap Detection** | Identifies IN-only rapid fingerprint taps (missing OUT punch) as missed attendance |
| **Personalised Email Summaries** | HTML email sent to each employee listing only their outstanding items |
| **Per-Employee Email (HR Report)** | HR Users can send individual attendance summary emails directly from the HR Report page |
| **Email Send History** | Full audit log of all individually sent emails, viewable from the HR Report Send History tab |
| **Weekly & Monthly Scheduled Emails** | Automatic background jobs send summaries for the previous week and previous month, controlled via Attendance Processor Settings |
| **Attendance Summary Report** | Interactive desk page for HR to preview results, filter by employee or date range, and trigger bulk email sends |
| **HR Report** | Advanced desk page with summary stat cards, per-employee email sending, search/sort/filter toolbar, and send history |
| **Approver Summary** | Desk page for leave approvers to see all pending applications belonging to their direct reports, grouped by type |
| **Leave Balance Report** | Desk page for HR to view Casual and Casual (Contract) leave allocations, taken days, and remaining balances for all Contract employees, with Excel export |
| **Attendance Processor Settings** | Single-document settings page to configure email templates, scheduled job behaviour, and approver summary lookback period |
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

## Updating the App

Use these steps whenever a new version is released on GitHub.

### 1 — Pull the latest code

```bash
cd /home/frappe-user/frappe-bench/apps/attendance_processor
git pull upstream main
```

> If your remote is named differently (e.g. `origin`), replace `upstream` with the correct remote name. Run `git remote -v` to check.

### 2 — Run database migration

```bash
cd /home/frappe-user/frappe-bench
bench --site <your-site-name> migrate
```

### 3 — Rebuild front-end assets

```bash
bench build --app attendance_processor
```

### 4 — Restart the bench

```bash
bench restart
```

All four steps together in one block:

```bash
cd /home/frappe-user/frappe-bench/apps/attendance_processor && git pull upstream main
cd /home/frappe-user/frappe-bench
bench --site <your-site-name> migrate
bench build --app attendance_processor
bench restart
```

> **Tip:** To find your site name run `ls sites/` from the bench root — ignore `assets` and `apps.txt`.

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

### 4. Attendance Processor Settings

After installation, open **Attendance Processor Settings** (search for it in the desk or navigate to it from the module). This single-document settings page lets you configure:

| Setting | Description |
|---|---|
| **Email Intro Text** | Opening paragraph of the employee attendance summary email |
| **Email No Issues Text** | Body text sent to employees with no outstanding items |
| **Email Signature** | Sign-off block appended to every employee email |
| **Email Footer Note** | Small-print disclaimer at the bottom of employee emails |
| **Approver Email Intro Text** | Opening paragraph of the approver summary email |
| **Approver Email No Pending Text** | Body text sent to approvers with no pending applications |
| **Monthly Send Day** | Day of the month (1–28) on which the monthly summary job fires |
| **Approver Summary Lookback Days** | How many days back the approver summary scans for pending applications (minimum 1) |

All fields fall back to built-in defaults if left blank.

### 5. Scheduled Jobs

The app ships a single **hourly** scheduled job that reads **Attendance Processor Settings** to decide whether to fire the weekly and/or monthly report jobs. This is already registered in `hooks.py` — no manual edits required after installation:

```python
scheduler_events = {
    "hourly": [
        "attendance_processor.scheduler.run_scheduled_reports",
    ],
}
```

Control when automatic emails are sent by configuring the relevant fields in **Attendance Processor Settings** (e.g. *Monthly Send Day*).

| Function | Trigger | Description |
|---|---|---|
| `attendance_processor.scheduler.run_scheduled_reports` | Every hour (checks settings) | Fires weekly and/or monthly email summary jobs when the configured schedule is reached |

---

## Desk Pages

All pages are accessible only to authenticated ERPNext users. Navigating directly to any URL will redirect unauthenticated visitors to the login page.

| Page | URL | Access |
|---|---|---|
| Attendance Processor Home | `/app/attendance-processor-home` | All authenticated users |
| Attendance Summary Report | `/app/attendance-summary-report` | System Manager, HR Manager |
| HR Report | `/app/hr-report` | System Manager, HR User |
| Approver Summary | `/app/approver-summary` | System Manager, HR Manager, Department Head Attendance Appr |
| Leave Balance Report | `/app/leave-balance-report` | System Manager, HR Manager, HR User |

> **Example full URLs** (replace `<your-site>` with your actual site domain, e.g. `ucsctest_site.com`):
> - `https://<your-site>/app/attendance-processor-home`
> - `https://<your-site>/app/attendance-summary-report`
> - `https://<your-site>/app/hr-report`
> - `https://<your-site>/app/approver-summary`
> - `https://<your-site>/app/leave-balance-report`

### Attendance Processor Home

The Home page is the recommended entry point for all users. It displays role-aware cards that link to the pages the current user is permitted to access. The **Attendance Summary Report** card is always visible; the **Approver Summary** card is shown only to System Managers and users with the `Department Head Attendance Appr` role; the **Leave Balance Report** card is visible to HR Manager, HR User, and System Manager.

### Leave Balance Report

The Leave Balance Report page shows a month-by-month snapshot of Casual and Casual (Contract) leave allocations, taken days, and remaining balances for all active Contract and Contract Basis employees. It also supports Excel export.

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

### HR Report (HR User / System Manager)

**Navigate to:** ERPNext Desk → *Attendance Processor Home* → **HR Report** card
or go directly to `/app/hr-report`
(full URL: `https://<your-site>/app/hr-report`)

The HR Report page is an advanced dashboard for HR Users. It combines attendance analysis with per-employee email sending and a full email send history.

#### Filter Bar

The same **Period**, **From Date**, **To Date**, and **Add Employee** controls as the Attendance Summary Report. The page auto-loads with *Last Month* pre-selected.

#### Tabs

The page is split into two tabs:

| Tab | Description |
|---|---|
| **Attendance Report** | Analysis results with stat cards, search/sort toolbar, and per-employee accordion cards |
| **Send History** | Full audit log of all individually sent emails (badge shows total count) |

#### Summary Stat Cards

After clicking **Preview Report**, six stat cards appear above the results:

| Card | What it shows |
|---|---|
| Employees Analysed | Total active employees in the date range |
| Employees with Issues | Count of employees who have at least one outstanding item |
| Missed Attendance | Total missed attendance records across all employees |
| Leave Applications | Total outstanding leave application records |
| Short Leave | Total outstanding short leave records |
| Two Late → Half Day | Total two-late-to-half-day records |

#### Toolbar

| Control | Description |
|---|---|
| **Search box** | Filter the employee list by name or employee ID |
| **Sort** | Order by Issues High→Low, Issues Low→High, Name A→Z, or Name Z→A |
| **Expand All / Collapse All** | Expand or collapse all employee accordion cards at once |
| **Period & count display** | Shows the active date range and how many employees are currently visible |

#### Per-Employee Email Sending

Each employee card in the HR Report has a **Send Email** button. Clicking it opens a confirmation dialog showing the employee name and date range. On confirmation:

- The app calls `send_hr_individual_email` for that employee.
- A success or error alert is shown immediately.
- The **Send History** tab is refreshed automatically in the background.

#### Send History Tab

The Send History tab shows a table of all individually sent emails, including:

| Column | Description |
|---|---|
| Employee Name | Full name of the employee |
| Employee ID | ERPNext employee ID |
| From Date / To Date | The analysis period that was emailed |
| Issues | Number of outstanding issues included in the email |
| Email | The address the email was sent to |
| Status | `sent` (green) or error indicator (red) |
| Sent By | The logged-in user who triggered the send |
| Sent On | Timestamp of the send |

Click **Refresh** to reload the history at any time.

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

### Leave Balance Report (HR / System Manager)

**Navigate to:** ERPNext Desk → *Attendance Processor Home* → **Leave Balance Report** card
or go directly to `/app/leave-balance-report`
(full URL: `https://<your-site>/app/leave-balance-report`)

This page provides a snapshot of leave entitlements and usage for all active Contract and Contract Basis employees for a selected month.

#### Filter Bar

| Control | Description |
|---|---|
| **Month** | Select dropdown — January through December |
| **Year** | Integer field — enter the target year (e.g. 2026) |

#### Generating a Report

1. Select the **Month** and **Year** from the filter bar.
2. Click **Preview Report**.
3. Results load immediately — one row per employee who has at least one leave allocation in the period.

#### Summary Stat Cards

Four stat cards appear above the results table:

| Card | What it shows |
|---|---|
| Total Employees | Number of Contract / Contract Basis employees with allocations |
| Total Allocated | Sum of all leave days allocated across both leave types |
| Total Taken | Sum of all leave days taken (Approved or Open applications) |
| Total Remaining | Sum of remaining leave balance across all employees |

#### Search & Filter Toolbar

| Control | Description |
|---|---|
| **Search box** | Filter rows by employee name or employee ID (client-side, instant) |
| **Department** | Dropdown populated from the data — filter to one department |
| **Employment Type** | Filter by Contract or Contract Basis |

All filters are applied client-side without a server round-trip.

#### Results Table

The scrollable table contains the following columns:

| Column | Description |
|---|---|
| # | Row number |
| Employee ID | ERPNext employee ID |
| Employee Name | Full name |
| Department | Employee's department |
| Employment Type | Contract or Contract Basis |
| Casual Allocated | Leave days allocated under the *Casual* leave type |
| Casual Taken | Leave days taken under *Casual* |
| Casual Balance | Remaining *Casual* days — **green** if > 0, **red** if 0 |
| Casual (Contract) Allocated | Leave days allocated under *Casual (Contract)* |
| Casual (Contract) Taken | Leave days taken under *Casual (Contract)* |
| Casual (Contract) Balance | Remaining *Casual (Contract)* days — **green** if > 0, **red** if 0 |
| Total Balance | Combined remaining balance (bold) — **green** if > 0, **red** if 0 |

#### Exporting to Excel

Click **Export Excel** to download an `.xlsx` file. The workbook contains:

- Dark-blue header row with white bold text
- Alternating light-blue / white data rows
- Green fill on balance cells with a remaining balance > 0; red fill on zero-balance cells
- Auto-fitted column widths

Filename format: `Leave_Balance_<MonthName>_<Year>.xlsx` (e.g. `Leave_Balance_June_2026.xlsx`).

---

### Automated Weekly & Monthly Emails

When the scheduled job is active (see [Scheduled Jobs](#5-scheduled-jobs)), employees automatically receive an HTML email summarising their outstanding attendance items for:

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
| **0 — Rapid IN tap** | Only an IN punch present with no OUT punch (rapid fingerprint tap) | `Missed Attendance Request` |
| **1 — Missed Attendance** | One punch present, the other missing (in XOR out) | `Missed Attendance Request` |
| **2 — Leave Application (absent)** | Status = Absent, no in/out times, no existing leave cover | `Leave Application` |
| **2b — Leave Application (half day)** | Status = Half Day, remarks contain `"Half Day"` but not `"Short Leave"`, not covered by leave/short-leave/two-late | `Leave Application` |
| **3 — Short Leave** | Remarks contain `"Half Day / Short Leave"`, not already filed, within the monthly short-leave limit (default 2) | `Short Leave Application` |
| **4 — Two Late → Half Day** | Same as check 3 but the employee arrived within the configured shift late-arrival window AND promotion limit not yet reached (default 2 per month) | Promoted to `Two Late Attendance To One Half Day`; reverts to Short Leave if only one such record exists in the month |
| **Overflow** | Short Leave / Two Late limit already exhausted for the month | `Leave Application` (overflow) |

---

## Role & Permission Matrix

| Feature | System Manager | HR Manager | HR User | Leave Approver | Employee |
|---|---|---|---|---|---|
| Attendance Summary Report — view | ✅ | ✅ | ❌ | ❌ | ❌ |
| Attendance Summary Report — send emails | ✅ | ❌ | ❌ | ❌ | ❌ |
| HR Report — view & analyse | ✅ | ❌ | ✅ | ❌ | ❌ |
| HR Report — send individual emails | ✅ | ❌ | ✅ | ❌ | ❌ |
| HR Report — view send history | ✅ | ❌ | ✅ | ❌ | ❌ |
| Approver Summary — view all approvers | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approver Summary — view own team | ✅ | ✅ | ❌ | ✅ | ❌ |
| Leave Balance Report — view & export | ✅ | ✅ | ✅ | ❌ | ❌ |
| Automated email recipient | ✅ | ✅ | ✅ | ✅ | ✅ (if active) |

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
