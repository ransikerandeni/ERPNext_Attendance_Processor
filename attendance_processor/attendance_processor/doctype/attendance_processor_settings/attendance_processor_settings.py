# Copyright (c) 2026, UCSC and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AttendanceProcessorSettings(Document):
    def onload(self):
        from attendance_processor.utils.email_report import (
            _DEFAULT_INTRO_TEXT,
            _DEFAULT_NO_ISSUES_TEXT,
            _DEFAULT_SIGNATURE,
            _DEFAULT_FOOTER_NOTE,
        )
        from attendance_processor.utils.approver_report import (
            _DEFAULT_APPROVER_INTRO,
            _DEFAULT_APPROVER_NO_PENDING,
        )
        if not self.email_intro_text:
            self.email_intro_text = _DEFAULT_INTRO_TEXT
        if not self.email_no_issues_text:
            self.email_no_issues_text = _DEFAULT_NO_ISSUES_TEXT
        if not self.email_signature:
            self.email_signature = _DEFAULT_SIGNATURE
        if not self.email_footer_note:
            self.email_footer_note = _DEFAULT_FOOTER_NOTE
        if not getattr(self, "approver_email_intro_text", None):
            self.approver_email_intro_text = _DEFAULT_APPROVER_INTRO
        if not getattr(self, "approver_email_no_pending_text", None):
            self.approver_email_no_pending_text = _DEFAULT_APPROVER_NO_PENDING

    def validate(self):
        if self.monthly_send_day is not None:
            day = int(self.monthly_send_day)
            if not (1 <= day <= 28):
                frappe.throw(
                    frappe._("Monthly 'Send on Day of Month' must be between 1 and 28."),
                    title=frappe._("Invalid Setting"),
                )

        if self.approver_summary_lookback_days is not None:
            days = int(self.approver_summary_lookback_days)
            if days < 1:
                frappe.throw(
                    frappe._("Approver Summary 'Lookback Period' must be at least 1 day."),
                    title=frappe._("Invalid Setting"),
                )
