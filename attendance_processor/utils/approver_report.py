import frappe
from frappe.utils import getdate
from html import escape as _esc

# ---------------------------------------------------------------------------
# Color / label configuration (mirrors email_report.py)
# ---------------------------------------------------------------------------

_HEADER_COLOR = "#7C3AED"   # purple — distinct from the employee email blue
_HEADER_LIGHT = "#EDE9FE"
_HEADER_TEXT  = "#5B21B6"

_TYPE_CONFIG = {
    "leave_applications": {
        "label":       "Leave Applications",
        "color":       "#EA580C",
        "light_color": "#FFEDD5",
        "dark_text":   "#9A3412",
    },
    "two_late_applications": {
        "label":       "Two Late Attendance To One Half Day",
        "color":       "#7C3AED",
        "light_color": "#EDE9FE",
        "dark_text":   "#5B21B6",
    },
    "short_leave_applications": {
        "label":       "Short Leave Applications",
        "color":       "#2563EB",
        "light_color": "#EFF6FF",
        "dark_text":   "#1E40AF",
    },
    "missed_attendance_requests": {
        "label":       "Missed Attendance Requests",
        "color":       "#DC2626",
        "light_color": "#FEE2E2",
        "dark_text":   "#991B1B",
    },
}

_DEFAULT_APPROVER_INTRO = (
    "The following applications are currently pending your approval. "
    "Please log in to ERPNext and action them at your earliest convenience."
)
_DEFAULT_APPROVER_NO_PENDING = (
    "There are no applications currently pending your approval for this period. "
    "Thank you for keeping approvals up to date."
)


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------

def fetch_approver_data(from_date, to_date):
    """
    Fetch all pending applications within the given date range and group them
    by leave_approver (User ID).  No permission filtering is applied — this is
    intended for use by scheduled/admin jobs only.

    Returns:
        dict keyed by approver user-id:
        {
            "user@example.com": {
                "approver_name": str,
                "leave_applications": [...],
                "two_late_applications": [...],
                "short_leave_applications": [...],
                "missed_attendance_requests": [...],
            },
            ...
        }
        The sentinel key "No Approver Assigned" is excluded so that emails are
        only sent to identifiable approvers.
    """
    fd = getdate(from_date)
    td = getdate(to_date)

    # ── Fetch all four application types ────────────────────────────────────

    leave_applications = frappe.db.get_all(
        "Leave Application",
        filters=[
            ["from_date", "<=", td],
            ["to_date",   ">=", fd],
            ["status",    "=",  "Open"],
            ["docstatus", "!=", 2],
        ],
        fields=[
            "name", "employee", "employee_name",
            "from_date", "to_date", "status",
            "leave_type", "total_leave_days",
        ],
    )

    two_late_applications = frappe.db.get_all(
        "Two Late Attendance To One Half Day",
        filters=[
            ["attendance_date",        "<=", td],
            ["second_attendance_date", ">=", fd],
            ["status",    "=",  "Department Head Review"],
            ["docstatus", "!=", 2],
        ],
        fields=[
            "name", "employee", "employee_name",
            "attendance_date", "second_attendance_date", "status",
        ],
    )

    short_leave_applications = frappe.db.get_all(
        "Short Leave Application",
        filters=[
            ["attendance_date", ">=", fd],
            ["attendance_date", "<=", td],
            ["status",    "=",  "Waiting for Department Head Review"],
            ["docstatus", "!=", 2],
        ],
        fields=[
            "name", "employee", "employee_name",
            "attendance_date", "status",
        ],
    )

    missed_attendance_requests = frappe.db.get_all(
        "Missed Attendance Request",
        filters=[
            ["attendance_date", ">=", fd],
            ["attendance_date", "<=", td],
            ["status",    "=",  "Department Head Review"],
            ["docstatus", "!=", 2],
        ],
        fields=[
            "name", "employee", "employee_name",
            "attendance_date", "status",
        ],
    )

    # ── Batch-fetch employee info ────────────────────────────────────────────

    all_records = (
        leave_applications
        + two_late_applications
        + short_leave_applications
        + missed_attendance_requests
    )

    unique_employees = {rec.employee for rec in all_records if rec.employee}

    emp_cache = {}
    if unique_employees:
        emp_records = frappe.db.get_all(
            "Employee",
            filters={"name": ["in", list(unique_employees)]},
            fields=["name", "leave_approver", "department", "employee_name"],
        )
        for emp in emp_records:
            emp_cache[emp.name] = {
                "leave_approver": emp.leave_approver,
                "department":     emp.department,
                "employee_name":  emp.employee_name,
            }
    for emp_id in unique_employees:
        if emp_id not in emp_cache:
            emp_cache[emp_id] = {
                "leave_approver":  None,
                "department":      None,
                "employee_name":   emp_id,
            }

    # ── Batch-fetch approver full names ──────────────────────────────────────

    unique_approver_ids = {
        info.get("leave_approver")
        for info in emp_cache.values()
        if info.get("leave_approver")
    }
    approver_name_cache = {}
    if unique_approver_ids:
        approver_records = frappe.db.get_all(
            "User",
            filters={"name": ["in", list(unique_approver_ids)]},
            fields=["name", "full_name"],
        )
        for user in approver_records:
            approver_name_cache[user.name] = user.full_name or user.name

    def _approver_info(user_id):
        """Return (key, display_name) for an approver user_id."""
        if not user_id:
            return None, None   # skip unassigned
        return user_id, approver_name_cache.get(user_id, user_id)

    # ── Group records by approver ────────────────────────────────────────────

    grouped = {}

    def _ensure_approver(key, display_name):
        if key not in grouped:
            grouped[key] = {
                "approver_name":             display_name,
                "leave_applications":        [],
                "two_late_applications":     [],
                "short_leave_applications":  [],
                "missed_attendance_requests": [],
            }

    def _enrich(rec):
        emp_info = emp_cache.get(rec.employee, {})
        d = dict(rec)
        for date_field in (
            "from_date", "to_date",
            "attendance_date", "second_attendance_date",
        ):
            if date_field in d and d[date_field]:
                d[date_field] = str(d[date_field])
        d["department"] = emp_info.get("department") or ""
        if not d.get("employee_name"):
            d["employee_name"] = emp_info.get("employee_name") or rec.employee
        return d

    for rec in leave_applications:
        key, name = _approver_info(emp_cache.get(rec.employee, {}).get("leave_approver"))
        if key is None:
            continue
        _ensure_approver(key, name)
        grouped[key]["leave_applications"].append(_enrich(rec))

    for rec in two_late_applications:
        key, name = _approver_info(emp_cache.get(rec.employee, {}).get("leave_approver"))
        if key is None:
            continue
        _ensure_approver(key, name)
        grouped[key]["two_late_applications"].append(_enrich(rec))

    for rec in short_leave_applications:
        key, name = _approver_info(emp_cache.get(rec.employee, {}).get("leave_approver"))
        if key is None:
            continue
        _ensure_approver(key, name)
        grouped[key]["short_leave_applications"].append(_enrich(rec))

    for rec in missed_attendance_requests:
        key, name = _approver_info(emp_cache.get(rec.employee, {}).get("leave_approver"))
        if key is None:
            continue
        _ensure_approver(key, name)
        grouped[key]["missed_attendance_requests"].append(_enrich(rec))

    return grouped


# ---------------------------------------------------------------------------
# Email builder
# ---------------------------------------------------------------------------

def _build_leave_table(records, cfg):
    """Build the HTML table for Leave Applications."""
    if not records:
        return ""

    n    = len(records)
    word = "record" if n == 1 else "records"
    rows = []
    for i, r in enumerate(records):
        bg = "#F9F9F9" if i % 2 == 0 else "#FFFFFF"
        rows.append(
            f'<tr style="background:{bg};">'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("employee_name",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("department",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(str(r.get("from_date","") or ""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(str(r.get("to_date","") or ""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("leave_type",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">'
            f'{r.get("total_leave_days","")}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("status",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;font-family:monospace;">'
            f'{_esc(r.get("name",""))}</td>'
            f'</tr>'
        )

    color      = cfg["color"]
    light      = cfg["light_color"]
    dark       = cfg["dark_text"]
    label      = cfg["label"]
    rows_html  = "\n        ".join(rows)

    return (
        f'<div style="margin-bottom:24px;">'
        f'<h3 style="color:{color};margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;">'
        f'{_esc(label)}&nbsp;&nbsp;({n} {word})'
        f'</h3>'
        f'<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">'
        f'<thead>'
        f'<tr style="background:{light};color:{dark};">'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Employee</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Department</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">From Date</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">To Date</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Leave Type</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:center;">Days</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Status</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Application No.</th>'
        f'</tr>'
        f'</thead>'
        f'<tbody>\n        {rows_html}\n      </tbody>'
        f'</table>'
        f'</div>'
    )


def _build_single_date_table(records, cfg, date_field="attendance_date"):
    """Build an HTML table for applications with a single attendance date."""
    if not records:
        return ""

    n    = len(records)
    word = "record" if n == 1 else "records"
    rows = []
    for i, r in enumerate(records):
        bg = "#F9F9F9" if i % 2 == 0 else "#FFFFFF"
        rows.append(
            f'<tr style="background:{bg};">'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("employee_name",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("department",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">'
            f'{_esc(str(r.get(date_field,"") or ""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("status",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;font-family:monospace;">'
            f'{_esc(r.get("name",""))}</td>'
            f'</tr>'
        )

    color     = cfg["color"]
    light     = cfg["light_color"]
    dark      = cfg["dark_text"]
    label     = cfg["label"]
    date_hdr  = "Attendance Date"
    rows_html = "\n        ".join(rows)

    return (
        f'<div style="margin-bottom:24px;">'
        f'<h3 style="color:{color};margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;">'
        f'{_esc(label)}&nbsp;&nbsp;({n} {word})'
        f'</h3>'
        f'<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">'
        f'<thead>'
        f'<tr style="background:{light};color:{dark};">'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Employee</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Department</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">{date_hdr}</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Status</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Application No.</th>'
        f'</tr>'
        f'</thead>'
        f'<tbody>\n        {rows_html}\n      </tbody>'
        f'</table>'
        f'</div>'
    )


def _build_two_late_table(records, cfg):
    """Build HTML table for Two Late applications (two date columns)."""
    if not records:
        return ""

    n    = len(records)
    word = "record" if n == 1 else "records"
    rows = []
    for i, r in enumerate(records):
        bg = "#F9F9F9" if i % 2 == 0 else "#FFFFFF"
        rows.append(
            f'<tr style="background:{bg};">'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("employee_name",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("department",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">'
            f'{_esc(str(r.get("attendance_date","") or ""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">'
            f'{_esc(str(r.get("second_attendance_date","") or ""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{_esc(r.get("status",""))}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;font-family:monospace;">'
            f'{_esc(r.get("name",""))}</td>'
            f'</tr>'
        )

    color     = cfg["color"]
    light     = cfg["light_color"]
    dark      = cfg["dark_text"]
    label     = cfg["label"]
    rows_html = "\n        ".join(rows)

    return (
        f'<div style="margin-bottom:24px;">'
        f'<h3 style="color:{color};margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;">'
        f'{_esc(label)}&nbsp;&nbsp;({n} {word})'
        f'</h3>'
        f'<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">'
        f'<thead>'
        f'<tr style="background:{light};color:{dark};">'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Employee</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Department</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">1st Late Date</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">2nd Late Date</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Status</th>'
        f'<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Application No.</th>'
        f'</tr>'
        f'</thead>'
        f'<tbody>\n        {rows_html}\n      </tbody>'
        f'</table>'
        f'</div>'
    )


def build_approver_html_email(approver_name, grouped_data, period_label):
    """
    Build the complete HTML email body for a single Leave Approver.

    Args:
        approver_name:  str  — display name of the approver
        grouped_data:   dict — the approver's entry from fetch_approver_data()
                               (keys: leave_applications, two_late_applications,
                                short_leave_applications, missed_attendance_requests)
        period_label:   str  — e.g. "2025-03-01 to 2025-03-27 (Last 90 Days)"

    Returns:
        Full HTML string starting with <!DOCTYPE html>.
    """
    leave_apps   = grouped_data.get("leave_applications", [])
    two_late     = grouped_data.get("two_late_applications", [])
    short_leave  = grouped_data.get("short_leave_applications", [])
    missed       = grouped_data.get("missed_attendance_requests", [])

    total = len(leave_apps) + len(two_late) + len(short_leave) + len(missed)
    has_pending = total > 0

    # Read template text and signature/footer from Settings
    try:
        _s = frappe.get_cached_doc("Attendance Processor Settings")
    except Exception:
        _s = None

    from attendance_processor.utils.email_report import (
        _DEFAULT_SIGNATURE,
        _DEFAULT_FOOTER_NOTE,
    )
    _intro      = (_s and _s.approver_email_intro_text      or _DEFAULT_APPROVER_INTRO).strip()
    _no_pending = (_s and _s.approver_email_no_pending_text or _DEFAULT_APPROVER_NO_PENDING).strip()
    _sig        = (_s and _s.email_signature                or _DEFAULT_SIGNATURE).strip()
    _footer     = (_s and _s.email_footer_note              or _DEFAULT_FOOTER_NOTE).strip()

    _sig_html    = "<br/>".join(_esc(line) for line in _sig.splitlines())
    _footer_html = _esc(_footer)

    safe_name   = _esc(approver_name)
    safe_period = _esc(period_label)

    if has_pending:
        intro_html = (
            f'<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;margin:0 0 16px 0;">'
            f'{_esc(_intro)}'
            f'</p>'
        )
        no_pending_html = ""
    else:
        intro_html = ""
        no_pending_html = (
            '<div style="padding:16px;background:#DCFCE7;border:1px solid #16A34A;'
            'border-radius:4px;font-family:Arial,sans-serif;color:#166534;margin-bottom:16px;">'
            f'&#10003;&nbsp; {_esc(_no_pending)}'
            '</div>'
        )

    sections_html = (
        _build_leave_table(leave_apps, _TYPE_CONFIG["leave_applications"])
        + _build_two_late_table(two_late, _TYPE_CONFIG["two_late_applications"])
        + _build_single_date_table(short_leave, _TYPE_CONFIG["short_leave_applications"])
        + _build_single_date_table(missed, _TYPE_CONFIG["missed_attendance_requests"])
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Approver Summary</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="720" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:6px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,.12);">

          <!-- Header Banner -->
          <tr>
            <td style="background:{_HEADER_LIGHT};border-bottom:2px solid {_HEADER_COLOR};padding:24px 32px;">
              <h1 style="margin:0;color:{_HEADER_TEXT};font-family:Arial,sans-serif;
                         font-size:20px;font-weight:bold;letter-spacing:.4px;">
                Approver Summary &mdash; {safe_period}
              </h1>
            </td>
          </tr>

          <!-- Email Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-family:Arial,sans-serif;font-size:15px;color:#333;
                        margin:0 0 16px 0;">
                Dear <strong>{safe_name}</strong>,
              </p>
              {intro_html}
              {no_pending_html}
              {sections_html}
              <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;"/>
              <p style="font-family:Arial,sans-serif;font-size:13px;color:#666;margin:0;">
                {_sig_html}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f0f0f0;padding:12px 32px;text-align:center;">
              <p style="font-family:Arial,sans-serif;font-size:11px;color:#999;margin:0;">
                {_footer_html}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Email sender
# ---------------------------------------------------------------------------

def send_approver_summary_email(approver_user_id, approver_name, grouped_data, period_label):
    """
    Send the approver summary email to the given Leave Approver.

    Args:
        approver_user_id: str  — ERPNext User ID (email address) of the approver
        approver_name:    str  — display name for the greeting
        grouped_data:     dict — that approver's entry from fetch_approver_data()
        period_label:     str  — human-readable period string
    """
    leave_apps  = grouped_data.get("leave_applications", [])
    two_late    = grouped_data.get("two_late_applications", [])
    short_leave = grouped_data.get("short_leave_applications", [])
    missed      = grouped_data.get("missed_attendance_requests", [])

    total = len(leave_apps) + len(two_late) + len(short_leave) + len(missed)

    if total > 0:
        subject = (
            f"[Action Required] Approver Summary \u2014 {period_label} "
            f"({total} pending)"
        )
    else:
        subject = f"Approver Summary \u2014 {period_label} (No Pending Items)"

    html_body = build_approver_html_email(approver_name, grouped_data, period_label)

    try:
        frappe.sendmail(
            recipients=[approver_user_id],
            subject=subject,
            message=html_body,
            now=True,
        )
    except Exception as exc:
        frappe.log_error(
            f"Failed to send approver summary to {approver_user_id} "
            f"({approver_name}): {exc}",
            title="Approver Summary: Email Send Failed",
        )
