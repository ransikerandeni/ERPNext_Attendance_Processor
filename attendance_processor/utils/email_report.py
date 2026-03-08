import frappe
from html import escape as _esc

# ---------------------------------------------------------------------------
# Color / label configuration
# ---------------------------------------------------------------------------

_SECTION_COLORS = {
    "missed_attendance_request": "#C0392B",  # red
    "leave_application":         "#E67E22",  # orange
    "short_leave_application":   "#2980B9",  # blue
    "two_late_to_half_day":      "#8E44AD",  # purple
}

_SECTION_LABELS = {
    "missed_attendance_request": "Missed Attendance Request",
    "leave_application":         "Leave Application",
    "short_leave_application":   "Short Leave Application",
    "two_late_to_half_day":      "Two Late Attendance To One Half Day",
}

_HEADER_COLOR = "#2F5496"  # deep blue


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _fmt_time(val):
    """Extract HH:MM:SS from a datetime-like value; return '—' if absent."""
    if not val:
        return "\u2014"
    s = str(val).strip()
    if " " in s:
        return s.split(" ", 1)[1]
    return s or "\u2014"


def _build_section_html(label, color, records):
    """
    Build one HTML <table> block for a single issue category.
    Returns an empty string if records is empty.
    """
    if not records:
        return ""

    n = len(records)
    record_word = "record" if n == 1 else "records"

    rows_html = []
    for i, rec in enumerate(records):
        bg      = "#F9F9F9" if i % 2 == 0 else "#FFFFFF"
        status  = _esc(rec.status or rec.custom_ucsc_status or "\u2014")
        in_t    = _esc(_fmt_time(rec.in_time))
        out_t   = _esc(_fmt_time(rec.out_time))
        shift   = _esc(rec.shift or "\u2014")
        remarks = _esc((rec.custom_remarks or "")[:80])
        att_dt  = _esc(str(rec.attendance_date))

        rows_html.append(
            f'<tr style="background:{bg};">'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{att_dt}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{status}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{in_t}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{out_t}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{shift}</td>'
            f'<td style="padding:6px 10px;border:1px solid #ddd;">{remarks}</td>'
            f'</tr>'
        )

    rows_joined = "\n        ".join(rows_html)

    return (
        f'<div style="margin-bottom:24px;">'
        f'<h3 style="color:{color};margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;">'
        f'{_esc(label)}&nbsp;&nbsp;({n} {record_word})'
        f'</h3>'
        f'<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">'
        f'<thead>'
        f'<tr style="background:{color};color:#fff;">'
        f'<th style="padding:8px 10px;border:1px solid #bbb;text-align:left;">Date</th>'
        f'<th style="padding:8px 10px;border:1px solid #bbb;text-align:left;">Status</th>'
        f'<th style="padding:8px 10px;border:1px solid #bbb;text-align:left;">In Time</th>'
        f'<th style="padding:8px 10px;border:1px solid #bbb;text-align:left;">Out Time</th>'
        f'<th style="padding:8px 10px;border:1px solid #bbb;text-align:left;">Shift</th>'
        f'<th style="padding:8px 10px;border:1px solid #bbb;text-align:left;">Remarks</th>'
        f'</tr>'
        f'</thead>'
        f'<tbody>'
        f'\n        {rows_joined}\n      '
        f'</tbody>'
        f'</table>'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_html_email(employee_name, issues, period_label):
    """
    Build the complete HTML email body for the given employee and issue dict.

    Args:
        employee_name: str  — display name
        issues:        dict — keys: missed_attendance_request, leave_application,
                              short_leave_application, two_late_to_half_day
        period_label:  str  — e.g. "2025-01-01 to 2025-01-31 (Monthly)"

    Returns:
        Full HTML string starting with <!DOCTYPE html>.
    """
    total_issues = sum(len(v) for v in issues.values())
    has_issues   = total_issues > 0

    # Build section blocks for every non-empty category
    sections_html = "".join(
        _build_section_html(
            _SECTION_LABELS[key],
            _SECTION_COLORS[key],
            issues.get(key, []),
        )
        for key in (
            "missed_attendance_request",
            "leave_application",
            "short_leave_application",
            "two_late_to_half_day",
        )
    )

    if has_issues:
        attention_block = (
            f'<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;margin:0 0 16px 0;">'
            f'A review of your attendance records for the above period has identified '
            f'<strong>{total_issues} item(s)</strong> that require your attention. '
            f'Please review the details below and submit the appropriate applications '
            f'through ERPNext at your earliest convenience.'
            f'</p>'
        )
        no_issues_block = ""
    else:
        attention_block = ""
        no_issues_block = (
            '<div style="padding:16px;background:#DFF0D8;border:1px solid #3C763D;'
            'border-radius:4px;font-family:Arial,sans-serif;color:#3C763D;margin-bottom:16px;">'
            '&#10003;&nbsp; No outstanding attendance items were found for this period. '
            'Thank you for keeping your attendance up to date.'
            '</div>'
        )

    safe_name   = _esc(employee_name)
    safe_period = _esc(period_label)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Attendance Summary</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:6px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,.12);">

          <!-- Header Banner -->
          <tr>
            <td style="background:{_HEADER_COLOR};padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-family:Arial,sans-serif;
                         font-size:20px;font-weight:bold;letter-spacing:.4px;">
                Attendance Summary &mdash; {safe_period}
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
              {attention_block}
              {no_issues_block}
              {sections_html}
              <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;"/>
              <p style="font-family:Arial,sans-serif;font-size:13px;color:#666;
                        margin:0 0 10px 0;">
                Please log in to <strong>ERPNext</strong> to submit the required
                applications. If you believe any record is incorrect, please contact
                the HR Division.
              </p>
              <p style="font-family:Arial,sans-serif;font-size:13px;color:#666;
                        margin:0;">
                Regards,<br/>
                <strong>HR Division</strong><br/>
                University of Colombo School of Computing
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f0f0f0;padding:12px 32px;text-align:center;">
              <p style="font-family:Arial,sans-serif;font-size:11px;color:#999;margin:0;">
                This is an automated message generated by the ERPNext Attendance
                Processor. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_summary_email(
    employee_id,
    employee_name,
    issues,
    period_label,
    send_even_if_no_issues=False,
):
    """
    Send the attendance summary email to the employee's linked ERPNext user.

    Args:
        employee_id:            str  — employee document name
        employee_name:          str  — display name for the email greeting
        issues:                 dict — four issue lists from analyse_employee()
        period_label:           str  — human-readable period string for subject/header
        send_even_if_no_issues: bool — if False (default), skip employees with no issues
    """
    has_issues = any(len(v) > 0 for v in issues.values())

    if not has_issues and not send_even_if_no_issues:
        return

    recipient = frappe.db.get_value("Employee", employee_id, "user_id")
    if not recipient:
        frappe.log_error(
            f"Employee {employee_id} ({employee_name}) has no linked User ID. "
            "Attendance summary email could not be delivered.",
            title="Attendance Summary: Missing User ID",
        )
        return

    if has_issues:
        subject = f"[Action Required] Attendance Summary \u2014 {period_label}"
    else:
        subject = f"Attendance Summary \u2014 {period_label} (No Issues)"

    html_body = build_html_email(employee_name, issues, period_label)

    try:
        frappe.sendmail(
            recipients=[recipient],
            subject=subject,
            message=html_body,
            now=True,
        )
    except Exception as exc:
        frappe.log_error(
            f"Failed to send attendance summary to {employee_id} "
            f"({employee_name}): {exc}",
            title="Attendance Summary: Email Send Failed",
        )
