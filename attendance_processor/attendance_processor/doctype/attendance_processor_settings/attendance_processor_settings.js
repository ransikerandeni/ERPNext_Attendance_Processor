// ─────────────────────────────────────────────────────────────────────────────
// Attendance Processor Settings — custom form JS
// Adds "Send Weekly Now" and "Send Monthly Now" buttons so an admin can
// trigger the report jobs directly from the browser without using the terminal.
// ─────────────────────────────────────────────────────────────────────────────

frappe.ui.form.on("Attendance Processor Settings", {
	refresh(frm) {
		// Only expose the buttons to System Managers
		if (!frappe.user_roles.includes("System Manager")) return;

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
			__("Actions")
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
			__("Actions")
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
			__("Actions")
		);
	},
});
