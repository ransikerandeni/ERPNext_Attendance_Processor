// ─────────────────────────────────────────────────────────────────────────────
// Attendance Processor Settings — custom form JS
//
// Button groups (System Manager only):
//   "Attendance Summary" — employee-facing attendance report emails
//   "Approver Summary"   — leave-approver pending-applications emails
// ─────────────────────────────────────────────────────────────────────────────

frappe.ui.form.on("Attendance Processor Settings", {
	refresh(frm) {
		// Only expose the buttons to System Managers
		if (!frappe.user_roles.includes("System Manager")) return;

		// ── Attendance Summary ────────────────────────────────────────────────

		frm.add_custom_button(
			__("Send Weekly Report Now"),
			function () {
				frappe.confirm(
					__(
						"This will immediately queue the <strong>weekly</strong> attendance summary " +
						"emails for the previous Mon–Sun week.<br><br>Continue?"
					),
					function () {
						frappe.call({
							method: "attendance_processor.utils.api.trigger_weekly_report",
							freeze: true,
							freeze_message: __("Queueing weekly report job…"),
							callback(r) {
								if (r.message && r.message.status === "queued") {
									frappe.show_alert(
										{ message: __(r.message.message), indicator: "green" },
										8
									);
								}
							},
						});
					}
				);
			},
			__("Attendance Summary")
		);

		frm.add_custom_button(
			__("Send Monthly Report Now"),
			function () {
				frappe.confirm(
					__(
						"This will immediately queue the <strong>monthly</strong> attendance summary " +
						"emails for the previous calendar month.<br><br>Continue?"
					),
					function () {
						frappe.call({
							method: "attendance_processor.utils.api.trigger_monthly_report",
							freeze: true,
							freeze_message: __("Queueing monthly report job…"),
							callback(r) {
								if (r.message && r.message.status === "queued") {
									frappe.show_alert(
										{ message: __(r.message.message), indicator: "green" },
										8
									);
								}
							},
						});
					}
				);
			},
			__("Attendance Summary")
		);

		frm.add_custom_button(
			__("Send Test Email to Employee"),
			function () {
				const dialog = new frappe.ui.Dialog({
					title: __("Send Test Email to Employee"),
					fields: [
						{
							label: __("Employee"),
							fieldname: "employee",
							fieldtype: "Link",
							options: "Employee",
							reqd: 1,
						},
						{
							label: __("Period"),
							fieldname: "period_type",
							fieldtype: "Select",
							options: [
								{ value: "now",     label: __("Now (Today)") },
								{ value: "weekly",  label: __("Last Week") },
								{ value: "monthly", label: __("Last Month") },
								{ value: "custom",  label: __("Custom Date Range") },
							],
							default: "now",
							reqd: 1,
						},
						{
							label: __("From Date"),
							fieldname: "from_date",
							fieldtype: "Date",
							depends_on: 'eval:doc.period_type==="custom"',
							mandatory_depends_on: 'eval:doc.period_type==="custom"',
						},
						{
							label: __("To Date"),
							fieldname: "to_date",
							fieldtype: "Date",
							depends_on: 'eval:doc.period_type==="custom"',
							mandatory_depends_on: 'eval:doc.period_type==="custom"',
						},
					],
					primary_action_label: __("Send Test Email"),
					primary_action(values) {
						dialog.hide();
						frappe.call({
							method: "attendance_processor.utils.api.send_test_email_to_employee",
							args: {
								employee:    values.employee,
								period_type: values.period_type,
								from_date:   values.from_date || null,
								to_date:     values.to_date   || null,
							},
							freeze: true,
							freeze_message: __("Sending test email…"),
							callback(r) {
								if (r.message) {
									if (r.message.status === "sent") {
										frappe.show_alert(
											{ message: __(r.message.message), indicator: "green" },
											10
										);
									} else if (r.message.status === "error") {
										frappe.msgprint({
											title:   __("Email Send Failed"),
											message: __(r.message.message),
											indicator: "red",
										});
									}
								}
							},
						});
					},
				});
				dialog.show();
			},
			__("Attendance Summary")
		);

		// ── Approver Summary ──────────────────────────────────────────────────

		frm.add_custom_button(
			__("Send Approver Summary Now"),
			function () {
				const dialog = new frappe.ui.Dialog({
					title: __("Send Approver Summary Emails"),
					fields: [
						{
							label: __("Date Range"),
							fieldname: "range_type",
							fieldtype: "Select",
							options: [
								{ value: "settings", label: __("Use Settings Lookback Period") },
								{ value: "custom",   label: __("Custom Date Range") },
							],
							default: "settings",
							reqd: 1,
						},
						{
							label: __("From Date"),
							fieldname: "from_date",
							fieldtype: "Date",
							depends_on: 'eval:doc.range_type==="custom"',
							mandatory_depends_on: 'eval:doc.range_type==="custom"',
						},
						{
							label: __("To Date"),
							fieldname: "to_date",
							fieldtype: "Date",
							depends_on: 'eval:doc.range_type==="custom"',
							mandatory_depends_on: 'eval:doc.range_type==="custom"',
						},
						{
							fieldtype: "HTML",
							options: `<p class="text-muted small" style="margin:4px 0 0;">
								This will email every Leave Approver who has pending applications
								within the selected period.
							</p>`,
						},
					],
					primary_action_label: __("Queue Emails"),
					primary_action(values) {
						dialog.hide();
						const useCustom = values.range_type === "custom";
						frappe.call({
							method: "attendance_processor.utils.api.trigger_approver_summary",
							args: {
								from_date: useCustom ? (values.from_date || null) : null,
								to_date:   useCustom ? (values.to_date   || null) : null,
							},
							freeze: true,
							freeze_message: __("Queueing approver summary job…"),
							callback(r) {
								if (r.message && r.message.status === "queued") {
									frappe.show_alert(
										{ message: __(r.message.message), indicator: "green" },
										8
									);
								}
							},
						});
					},
				});
				dialog.show();
			},
			__("Approver Summary")
		);

		frm.add_custom_button(
			__("Send Test Approver Email"),
			function () {
				const dialog = new frappe.ui.Dialog({
					title: __("Send Test Approver Summary Email"),
					fields: [
						{
							label: __("Send To (Approver User)"),
							fieldname: "approver_user",
							fieldtype: "Link",
							options: "User",
							reqd: 1,
							description: __("The ERPNext user who acts as a Leave Approver."),
						},
						{
							label: __("Date Range"),
							fieldname: "range_type",
							fieldtype: "Select",
							options: [
								{ value: "settings", label: __("Use Settings Lookback Period") },
								{ value: "custom",   label: __("Custom Date Range") },
							],
							default: "settings",
							reqd: 1,
						},
						{
							label: __("From Date"),
							fieldname: "from_date",
							fieldtype: "Date",
							depends_on: 'eval:doc.range_type==="custom"',
							mandatory_depends_on: 'eval:doc.range_type==="custom"',
						},
						{
							label: __("To Date"),
							fieldname: "to_date",
							fieldtype: "Date",
							depends_on: 'eval:doc.range_type==="custom"',
							mandatory_depends_on: 'eval:doc.range_type==="custom"',
						},
					],
					primary_action_label: __("Send Test Email"),
					primary_action(values) {
						dialog.hide();
						const useCustom = values.range_type === "custom";
						frappe.call({
							method: "attendance_processor.utils.api.send_test_approver_email",
							args: {
								approver_user: values.approver_user,
								from_date:     useCustom ? (values.from_date || null) : null,
								to_date:       useCustom ? (values.to_date   || null) : null,
							},
							freeze: true,
							freeze_message: __("Sending test approver email…"),
							callback(r) {
								if (r.message) {
									if (r.message.status === "sent") {
										frappe.show_alert(
											{ message: __(r.message.message), indicator: "green" },
											10
										);
									} else if (r.message.status === "error") {
										frappe.msgprint({
											title:     __("Email Send Failed"),
											message:   __(r.message.message),
											indicator: "red",
										});
									}
								}
							},
						});
					},
				});
				dialog.show();
			},
			__("Approver Summary")
		);
	},
});
