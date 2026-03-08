// ─────────────────────────────────────────────────────────────────────────────
// Attendance Summary Report — Frappe desk page
// ─────────────────────────────────────────────────────────────────────────────

frappe.pages["attendance-summary-report"].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Attendance Summary Report"),
		single_column: true,
	});

	new AttendanceSummaryReport(page);
};

// ─────────────────────────────────────────────────────────────────────────────

class AttendanceSummaryReport {
	constructor(page) {
		this.page = page;
		this.data = []; // full result set from the server
		this.filtered_data = []; // after client-side search
		this.sort_order = "issues_desc";
		this._setting_dates = false; // prevents change-event loops

		this._setup_filter_bar();
		this._setup_actions();
		this._render_shell();

		// Apply default period (last month) right away so the fields are
		// pre-filled when the page first opens.
		this._apply_preset("Last Month");
	}

	// ─── Filter bar ────────────────────────────────────────────────────────

	_setup_filter_bar() {
		var me = this;

		this.f_preset = this.page.add_field({
			label: __("Period"),
			fieldname: "period_preset",
			fieldtype: "Select",
			options: [
				"",
				"Last Week",
				"Last Month",
				"This Week",
				"This Month",
				"Custom",
			].join("\n"),
			change() {
				var v = me.f_preset.get_value();
				if (v && v !== "Custom") me._apply_preset(v);
			},
		});

		this.f_from = this.page.add_field({
			label: __("From Date"),
			fieldname: "from_date",
			fieldtype: "Date",
			change() {
				if (!me._setting_dates) me.f_preset.set_value("Custom");
			},
		});

		this.f_to = this.page.add_field({
			label: __("To Date"),
			fieldname: "to_date",
			fieldtype: "Date",
			change() {
				if (!me._setting_dates) me.f_preset.set_value("Custom");
			},
		});

		this.f_employee = this.page.add_field({
			label: __("Employee"),
			fieldname: "employee",
			fieldtype: "Link",
			options: "Employee",
		});
	}

	_apply_preset(preset) {
		var from, to;
		switch (preset) {
			case "Last Week":
				from = moment().subtract(1, "weeks").startOf("isoWeek").format("YYYY-MM-DD");
				to   = moment().subtract(1, "weeks").endOf("isoWeek").format("YYYY-MM-DD");
				break;
			case "Last Month":
				from = moment().subtract(1, "months").startOf("month").format("YYYY-MM-DD");
				to   = moment().subtract(1, "months").endOf("month").format("YYYY-MM-DD");
				break;
			case "This Week":
				from = moment().startOf("isoWeek").format("YYYY-MM-DD");
				to   = moment().endOf("isoWeek").format("YYYY-MM-DD");
				break;
			case "This Month":
				from = moment().startOf("month").format("YYYY-MM-DD");
				to   = moment().endOf("month").format("YYYY-MM-DD");
				break;
			default:
				return;
		}
		this._setting_dates = true;
		this.f_from.set_value(from);
		this.f_to.set_value(to);
		this.f_preset.set_value(preset);
		this._setting_dates = false;
	}

	// ─── Page action buttons ────────────────────────────────────────────────

	_setup_actions() {
		var me = this;

		this.page.set_primary_action(__("Preview Report"), function () {
			me._load_data();
		}, "search");

		this.page.add_button(__("Send Emails"), function () {
			me._confirm_send();
		}, { btn_class: "btn-warning" });
	}

	// ─── Static shell rendered once into page.main ─────────────────────────

	_render_shell() {
		this.$wrap = $(`
			<div class="ap-report-wrap" style="padding:0 20px 60px;">

				<div class="ap-empty-state text-center text-muted"
				     style="padding:80px 0 60px;">
					<div style="font-size:52px;margin-bottom:14px;">&#x1F4CB;</div>
					<p style="font-size:15px;">
						Choose a date range and click
						<strong>Preview Report</strong> to analyse attendance records.
					</p>
				</div>

				<div class="ap-results" style="display:none;"></div>
			</div>
		`).appendTo($(this.page.main));
	}

	// ─── Data load ─────────────────────────────────────────────────────────

	_load_data() {
		var me       = this;
		var from     = this.f_from.get_value();
		var to       = this.f_to.get_value();
		var employee = this.f_employee.get_value();

		if (!from || !to) {
			frappe.msgprint({
				title:     __("Missing Dates"),
				message:   __("Please select both From Date and To Date."),
				indicator: "orange",
			});
			return;
		}
		if (moment(from).isAfter(moment(to))) {
			frappe.msgprint({
				title:     __("Invalid Range"),
				message:   __("From Date must be on or before To Date."),
				indicator: "red",
			});
			return;
		}

		frappe.call({
			method: "attendance_processor.utils.api.get_attendance_analysis",
			args:   { from_date: from, to_date: to, employee: employee || "" },
			freeze: true,
			freeze_message: __("Analysing attendance records…"),
			callback(r) {
				if (r.message !== undefined) {
					me.data          = r.message;
					me.filtered_data = [...me.data];
					me.sort_order    = "issues_desc";
					me._render_results();
				}
			},
		});
	}

	_period_label() {
		var preset = this.f_preset.get_value();
		var from   = this.f_from.get_value();
		var to     = this.f_to.get_value();
		return (preset && preset !== "Custom")
			? `${preset} (${from} to ${to})`
			: `${from} to ${to}`;
	}

	// ─── Results rendering ──────────────────────────────────────────────────

	_render_results() {
		var $placeholder = this.$wrap.find(".ap-empty-state");
		var $results     = this.$wrap.find(".ap-results");

		$placeholder.hide();
		$results.show().empty();

		if (!this.data.length) {
			$results.html(`
				<div class="text-center text-muted" style="padding:60px 0;">
					<div style="font-size:44px;margin-bottom:14px;">&#10003;</div>
					<p style="font-size:15px;">
						No active employees found for this period.
					</p>
				</div>
			`);
			return;
		}

		this._render_stats($results);
		this._render_toolbar($results);
		this._render_list($results);
	}

	// ── Summary stat cards ─────────────────────────────────────────────────

	_render_stats($c) {
		var total       = this.data.length;
		var with_issues = this.data.filter(e => e.total_issues > 0).length;

		var counts = {
			missed_attendance_request: 0,
			leave_application:         0,
			short_leave_application:   0,
			two_late_to_half_day:      0,
		};
		this.data.forEach(emp => {
			Object.keys(counts).forEach(k => {
				counts[k] += (emp.issues[k] || []).length;
			});
		});

		const CARDS = [
			{ key: null,                           icon: "👥",  label: "Employees Analysed",        val: total,                                color: "#2F5496" },
			{ key: null,                           icon: "⚠️",  label: "Employees with Issues",     val: with_issues,                          color: "#C0392B" },
			{ key: "missed_attendance_request",    icon: "🕐",  label: "Missed Attendance",         val: counts.missed_attendance_request,     color: "#C0392B" },
			{ key: "leave_application",            icon: "📋",  label: "Leave Applications",        val: counts.leave_application,             color: "#E67E22" },
			{ key: "short_leave_application",      icon: "🌤",  label: "Short Leave",               val: counts.short_leave_application,       color: "#2980B9" },
			{ key: "two_late_to_half_day",         icon: "⏰",  label: "Two Late → Half Day",       val: counts.two_late_to_half_day,          color: "#8E44AD" },
		];

		var cards_html = CARDS.map(c => `
			<div class="col-xs-6 col-sm-4 col-md-2" style="padding:6px;">
				<div style="border:1px solid #e4e4e4; border-top:3px solid ${c.color};
				            border-radius:6px; text-align:center; padding:14px 8px;
				            background:#fff; height:100%;">
					<div style="font-size:24px;margin-bottom:4px;">${c.icon}</div>
					<div style="font-size:26px; font-weight:700; line-height:1;
					            color:${c.val > 0 ? c.color : "#aaa"};">
						${c.val}
					</div>
					<div style="font-size:11px; color:#777; margin-top:5px;
					            line-height:1.3;">
						${__(c.label)}
					</div>
				</div>
			</div>
		`).join("");

		$c.append(`
			<div style="margin-bottom:24px;">
				<div class="row" style="margin:0 -6px;">${cards_html}</div>
			</div>
		`);
	}

	// ── Toolbar: search + sort + expand/collapse ───────────────────────────

	_render_toolbar($c) {
		var me = this;

		var period_label = this._period_label();

		$c.append(`
			<div class="ap-toolbar"
			     style="display:flex; align-items:center; gap:10px;
			            flex-wrap:wrap; margin-bottom:14px;">

				<div style="flex:1; min-width:220px;">
					<input class="ap-search form-control"
					       placeholder="&#128269;  Filter by employee name or ID…"
					       style="max-width:340px; font-size:13px;">
				</div>

				<div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
					<label style="margin:0; font-size:12px; color:#888;">
						${__("Sort")}:
					</label>
					<select class="ap-sort form-control"
					        style="font-size:12px; width:auto; height:30px; padding:0 6px;">
						<option value="issues_desc">${__("Issues: High → Low")}</option>
						<option value="issues_asc">${__("Issues: Low → High")}</option>
						<option value="name_asc">${__("Name: A → Z")}</option>
						<option value="name_desc">${__("Name: Z → A")}</option>
					</select>
				</div>

				<div style="flex-shrink:0;">
					<button class="btn btn-xs btn-default ap-expand-all">
						${__("Expand All")}
					</button>
					<button class="btn btn-xs btn-default ap-collapse-all"
					        style="margin-left:4px;">
						${__("Collapse All")}
					</button>
				</div>

				<div style="flex-shrink:0; margin-left:auto;">
					<span style="font-size:12px; color:#888;">
						${__("Period")}: <strong>${frappe.utils.escape_html(period_label)}</strong>
						&nbsp;|&nbsp;
						Showing <span class="ap-count">${this.filtered_data.length}</span>
						/ ${this.data.length} ${__("employees")}
					</span>
				</div>
			</div>
		`);

		// Wire search
		$c.find(".ap-search").on("input", function () {
			var q = $(this).val().toLowerCase().trim();
			me.filtered_data = me.data.filter(e =>
				(e.employee_name || "").toLowerCase().includes(q) ||
				(e.employee_id  || "").toLowerCase().includes(q)
			);
			me._apply_sort();
			me._refresh_list();
			$c.find(".ap-count").text(me.filtered_data.length);
		});

		// Wire sort
		$c.find(".ap-sort").on("change", function () {
			me.sort_order = $(this).val();
			me._apply_sort();
			me._refresh_list();
		});

		// Expand / Collapse all
		$c.find(".ap-expand-all").on("click", function () {
			$c.find(".ap-emp-body").slideDown(150);
			$c.find(".ap-toggle-icon").text("▾");
		});
		$c.find(".ap-collapse-all").on("click", function () {
			$c.find(".ap-emp-body").slideUp(150);
			$c.find(".ap-toggle-icon").text("▸");
		});
	}

	// ── Employee accordion list ────────────────────────────────────────────

	_render_list($c) {
		this._apply_sort();
		this.$list = $('<div class="ap-emp-list"></div>').appendTo($c);
		this._populate_list();
	}

	_refresh_list() {
		if (!this.$list) return;
		this.$list.empty();
		this._populate_list();
	}

	_populate_list() {
		this.filtered_data.forEach((emp, i) => {
			this.$list.append(this._build_emp_card(emp, i));
		});
		this._wire_accordion(this.$list);
	}

	_apply_sort() {
		var order = this.sort_order;
		this.filtered_data.sort((a, b) => {
			if (order === "issues_desc") return b.total_issues - a.total_issues;
			if (order === "issues_asc")  return a.total_issues - b.total_issues;
			var na = (a.employee_name || "").toLowerCase();
			var nb = (b.employee_name || "").toLowerCase();
			if (order === "name_asc")  return na < nb ? -1 : na > nb ? 1 : 0;
			if (order === "name_desc") return na > nb ? -1 : na < nb ? 1 : 0;
			return 0;
		});
	}

	// ── Build one employee accordion card ─────────────────────────────────

	_build_emp_card(emp) {
		const COLORS = {
			missed_attendance_request: "#C0392B",
			leave_application:         "#E67E22",
			short_leave_application:   "#2980B9",
			two_late_to_half_day:      "#8E44AD",
		};
		const LABELS = {
			missed_attendance_request: __("Missed Attendance"),
			leave_application:         __("Leave Application"),
			short_leave_application:   __("Short Leave"),
			two_late_to_half_day:      __("Two Late → Half Day"),
		};

		var has_issues = emp.total_issues > 0;
		var header_bg  = has_issues ? "#fafafa" : "#f0faf5";

		// Issue count badges in the collapsed header row
		var badges_html = "";
		if (has_issues) {
			Object.keys(COLORS).forEach(k => {
				var n = (emp.issues[k] || []).length;
				if (!n) return;
				badges_html += `
					<span style="display:inline-block; padding:2px 9px;
					             border-radius:10px; background:${COLORS[k]};
					             color:#fff; font-size:11px; margin-left:6px;
					             white-space:nowrap;">
						${n} ${LABELS[k]}
					</span>`;
			});
		} else {
			badges_html = `
				<span style="display:inline-block; padding:2px 9px;
				             border-radius:10px; background:#27AE60;
				             color:#fff; font-size:11px; margin-left:6px;">
					&#10003; ${__("No Issues")}
				</span>`;
		}

		// Issue detail tables
		var tables_html = "";
		if (has_issues) {
			Object.keys(COLORS).forEach(k => {
				var recs = emp.issues[k] || [];
				if (recs.length) {
					tables_html += this._build_issue_table(recs, LABELS[k], COLORS[k]);
				}
			});
		} else {
			tables_html = `
				<p style="color:#27AE60; padding:16px 20px 14px; margin:0; font-size:13px;">
					&#10003; ${__("No uncovered attendance issues found for this period.")}
				</p>`;
		}

		var e_id   = frappe.utils.escape_html(emp.employee_id);
		var e_name = frappe.utils.escape_html(emp.employee_name);

		return `
			<div class="ap-emp-card"
			     style="border:1px solid #e0e0e0; border-radius:6px;
			            margin-bottom:8px; overflow:hidden;">

				<!-- Clickable header row -->
				<div class="ap-emp-header"
				     style="padding:11px 16px; cursor:pointer; background:${header_bg};
				            display:flex; align-items:center;
				            justify-content:space-between; user-select:none;">

					<div style="display:flex; align-items:center; gap:8px; min-width:0;">
						<span class="ap-toggle-icon"
						      style="font-size:12px; color:#aaa; min-width:12px;">▸</span>
						<span style="font-weight:600; color:#333; font-size:13px;
						            white-space:nowrap; overflow:hidden;
						            text-overflow:ellipsis;">
							${e_name}
						</span>
						<span style="color:#999; font-size:12px; white-space:nowrap;">
							(${e_id})
						</span>
					</div>

					<div style="flex-shrink:0; text-align:right;">
						${badges_html}
					</div>
				</div>

				<!-- Expandable body -->
				<div class="ap-emp-body"
				     style="display:none; border-top:1px solid #eee; background:#fff;">

					${tables_html}

					<div style="padding:10px 20px 14px;
					            border-top:1px solid #f0f0f0; background:#fafafa;">
						<a href="/app/employee/${e_id}"
						   target="_blank"
						   style="font-size:12px; color:#2980B9; text-decoration:none;">
							${__("View Employee Record")} &#8599;
						</a>
					</div>
				</div>
			</div>
		`;
	}

	// ── Single issue-category table ────────────────────────────────────────

	_build_issue_table(records, heading, color) {
		var rows_html = records.map((rec, i) => {
			var bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
			var es = s => frappe.utils.escape_html(String(s || "\u2014"));

			// derive the best display status
			var status = es(rec.status || rec.custom_ucsc_status);
			var in_t   = es(rec.in_time);
			var out_t  = es(rec.out_time);
			var att_dt = es(rec.attendance_date);
			var shift  = es(rec.shift);
			var remark = es(rec.custom_remarks);
			var link   = frappe.utils.escape_html(rec.name || "");

			return `
				<tr style="background:${bg};">
					<td style="padding:6px 10px; border:1px solid #eee;">
						${att_dt}
					</td>
					<td style="padding:6px 10px; border:1px solid #eee;">
						${status}
					</td>
					<td style="padding:6px 10px; border:1px solid #eee;
					           white-space:nowrap;">
						${in_t}
					</td>
					<td style="padding:6px 10px; border:1px solid #eee;
					           white-space:nowrap;">
						${out_t}
					</td>
					<td style="padding:6px 10px; border:1px solid #eee;">
						${shift}
					</td>
					<td style="padding:6px 10px; border:1px solid #eee;
					           max-width:220px; overflow:hidden;
					           text-overflow:ellipsis; white-space:nowrap;"
					    title="${remark}">
						${remark}
					</td>
					<td style="padding:6px 10px; border:1px solid #eee;
					           text-align:center;">
						${link
							? `<a href="/app/attendance/${link}"
							      target="_blank"
							      style="font-size:11px; color:#2980B9;">
								   ${__("Open")} &#8599;
								</a>`
							: ""}
					</td>
				</tr>`;
		}).join("");

		return `
			<div style="padding:16px 20px 4px;">
				<h4 style="color:${color}; font-size:12px; font-weight:700; margin:0 0 8px;
				           text-transform:uppercase; letter-spacing:.5px;">
					${frappe.utils.escape_html(heading)}
					<span style="font-weight:400; text-transform:none;
					             font-size:11px; color:#888;">
						&mdash; ${records.length}
						${records.length === 1 ? __("record") : __("records")}
					</span>
				</h4>
				<div style="overflow-x:auto; margin-bottom:16px;">
					<table style="width:100%; border-collapse:collapse;
					              font-size:12px; min-width:560px;">
						<thead>
							<tr style="background:${color}; color:#fff;">
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(255,255,255,.25);">${__("Date")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(255,255,255,.25);">${__("Status")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(255,255,255,.25);">${__("In Time")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(255,255,255,.25);">${__("Out Time")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(255,255,255,.25);">${__("Shift")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(255,255,255,.25);">${__("Remarks")}</th>
								<th style="padding:7px 10px; text-align:center; border:1px solid rgba(255,255,255,.25);">${__("Action")}</th>
							</tr>
						</thead>
						<tbody>${rows_html}</tbody>
					</table>
				</div>
			</div>
		`;
	}

	// ── Accordion toggle wiring ────────────────────────────────────────────

	_wire_accordion($list) {
		$list.find(".ap-emp-header").on("click", function () {
			var $card   = $(this).closest(".ap-emp-card");
			var $body   = $card.find(".ap-emp-body");
			var $toggle = $card.find(".ap-toggle-icon");
			if ($body.is(":visible")) {
				$body.slideUp(150);
				$toggle.text("▸");
			} else {
				$body.slideDown(200);
				$toggle.text("▾");
			}
		});
	}

	// ─── Send-emails flow ───────────────────────────────────────────────────

	_confirm_send() {
		var me       = this;
		var from     = this.f_from.get_value();
		var to       = this.f_to.get_value();
		var employee = this.f_employee.get_value();

		if (!from || !to) {
			frappe.msgprint({
				title:     __("Missing Dates"),
				message:   __("Please select both From Date and To Date before sending emails."),
				indicator: "orange",
			});
			return;
		}

		var scope = employee
			? `employee <strong>${frappe.utils.escape_html(employee)}</strong>`
			: `<strong>${__("all active employees")}</strong>`;

		var preview_note = this.data.length
			? `<br><br><span style="color:#888; font-size:12px;">
				${__("The current preview shows")} <strong>${
					this.data.filter(e => e.total_issues > 0).length
				}</strong> ${__("employee(s) with issues.")}
			   </span>`
			: "";

		frappe.confirm(
			`${__("Send attendance summary emails to")} ${scope}
			 ${__("for the period")}
			 <strong>${frappe.utils.escape_html(from)}</strong>
			 ${__("to")}
			 <strong>${frappe.utils.escape_html(to)}</strong>?
			 <br><br>
			 ${__("Only employees with at least one uncovered attendance issue will receive an email.")}
			 ${preview_note}`,
			function () { me._do_send(from, to, employee); }
		);
	}

	_do_send(from, to, employee) {
		frappe.call({
			method: "attendance_processor.utils.api.send_attendance_emails",
			args: {
				from_date: from,
				to_date:   to,
				employee:  employee || "",
			},
			freeze: true,
			freeze_message: __("Queuing email job…"),
			callback(r) {
				if (r.message) {
					frappe.show_alert({
						message:   r.message.message || __("Email job queued successfully."),
						indicator: "green",
					}, 8);
				}
			},
		});
	}
}
