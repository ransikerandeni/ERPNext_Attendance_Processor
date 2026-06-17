// ─────────────────────────────────────────────────────────────────────────────
// Leave Balance Report — Frappe desk page
// ─────────────────────────────────────────────────────────────────────────────

frappe.pages["leave-balance-report"].on_page_load = function (wrapper) {
	var allowed = ["System Manager", "HR Manager", "HR User"];
	var hasAccess = frappe.user_roles.some(function (r) { return allowed.includes(r); });
	if (!hasAccess) {
		$(wrapper).html(`
			<div style="padding:60px;text-align:center;color:#888;font-family:Arial,sans-serif;">
				<div style="font-size:48px;margin-bottom:16px;">🔒</div>
				<p style="font-size:16px;">${__("You do not have permission to access this page.")}</p>
			</div>
		`);
		return;
	}

	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Leave Balance Report"),
		single_column: true,
	});

	new LeaveBalanceReport(page);
};

// ─────────────────────────────────────────────────────────────────────────────

var MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

class LeaveBalanceReport {
	constructor(page) {
		this.page = page;
		this.data = [];
		this.filtered_data = [];

		this._setup_filter_bar();
		this._setup_actions();
		this._render_shell();

		// Default to current month/year
		this.f_month.set_value(moment().format("MMMM"));
		this.f_year.set_value(parseInt(moment().format("YYYY")));
	}

	// ─── Filter bar ────────────────────────────────────────────────────────

	_setup_filter_bar() {
		this.f_month = this.page.add_field({
			label:     __("Month"),
			fieldname: "month",
			fieldtype: "Select",
			options:   MONTH_NAMES.join("\n"),
		});

		this.f_year = this.page.add_field({
			label:     __("Year"),
			fieldname: "year",
			fieldtype: "Int",
		});
	}

	// ─── Page action buttons ────────────────────────────────────────────────

	_setup_actions() {
		var me = this;

		this.page.add_button(__("Home"), function () {
			frappe.set_route("attendance-processor-home");
		}, { icon: "home", btn_class: "btn-default" });

		this.page.set_primary_action(__("Preview Report"), function () {
			me._load_data();
		}, "search");

		this.page.add_button(__("Export Excel"), function () {
			me._export();
		}, { btn_class: "btn-default" });
	}

	// ─── Static shell ───────────────────────────────────────────────────────

	_render_shell() {
		this.$wrap = $(`
			<div class="ap-lb-wrap" style="padding:0 20px 60px;">
				<div class="ap-empty-state text-center text-muted"
				     style="padding:80px 0 60px;">
					<div style="font-size:52px;margin-bottom:14px;">📋</div>
					<p style="font-size:15px;">
						${__("Select a month and year, then click")}
						<strong>${__("Preview Report")}</strong>
						${__("to view leave balances.")}
					</p>
				</div>
				<div class="ap-results" style="display:none;"></div>
			</div>
		`).appendTo($(this.page.main));
	}

	// ─── Data load ──────────────────────────────────────────────────────────

	_load_data() {
		var me        = this;
		var monthName = this.f_month.get_value();
		var year      = this.f_year.get_value();
		var month     = MONTH_NAMES.indexOf(monthName) + 1; // 1-indexed

		if (!month || !year) {
			frappe.msgprint({
				title:     __("Missing Fields"),
				message:   __("Please select both Month and Year."),
				indicator: "orange",
			});
			return;
		}

		frappe.call({
			method:         "attendance_processor.utils.api.get_leave_balance_data",
			args:           { month: month, year: year },
			freeze:         true,
			freeze_message: __("Loading leave balances…"),
			callback(r) {
				if (r.message !== undefined) {
					me.data          = r.message;
					me.filtered_data = [...me.data];
					me._render_results();
				}
			},
		});
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
					<div style="font-size:44px;margin-bottom:14px;">📋</div>
					<p style="font-size:15px;">
						${__("No leave allocations found for this period.")}
					</p>
				</div>
			`);
			return;
		}

		this._render_stats($results);
		this._render_toolbar($results);
		this._render_table($results);
	}

	// ─── Summary stat cards ─────────────────────────────────────────────────

	_render_stats($c) {
		var total          = this.data.length;
		var totalAllocated = this.data.reduce(function (s, e) { return s + e.total_allocated; }, 0);
		var totalTaken     = this.data.reduce(function (s, e) { return s + e.total_taken; }, 0);
		var totalBalance   = this.data.reduce(function (s, e) { return s + e.total_balance; }, 0);

		var CARDS = [
			{ icon: "👥", label: "Total Employees",  val: total,          color: "#2563EB" },
			{ icon: "📋", label: "Total Allocated",  val: totalAllocated, color: "#166534" },
			{ icon: "📤", label: "Total Taken",      val: totalTaken,     color: "#EA580C" },
			{ icon: "✅", label: "Total Remaining",  val: totalBalance,   color: "#0D9488" },
		];

		var cards_html = CARDS.map(function (c) {
			return `
				<div class="col-xs-6 col-sm-3" style="padding:6px;">
					<div style="border:1px solid #e4e4e4; border-top:3px solid ${c.color};
					            border-radius:6px; text-align:center; padding:14px 8px;
					            background:#fff; height:100%;">
						<div style="font-size:24px;margin-bottom:4px;">${c.icon}</div>
						<div style="font-size:26px; font-weight:700; line-height:1;
						            color:${c.val > 0 ? c.color : "#aaa"};">
							${c.val}
						</div>
						<div style="font-size:11px; color:#777; margin-top:5px; line-height:1.3;">
							${__(c.label)}
						</div>
					</div>
				</div>
			`;
		}).join("");

		$c.append(`
			<div style="margin-bottom:24px;">
				<div class="row" style="margin:0 -6px;">${cards_html}</div>
			</div>
		`);
	}

	// ─── Toolbar: search + department + employment type ─────────────────────

	_render_toolbar($c) {
		var me = this;

		var departments = [""].concat(
			[...new Set(this.data.map(function (e) { return e.department || ""; }).filter(Boolean))].sort()
		);
		var dept_options = departments.map(function (d) {
			return `<option value="${frappe.utils.escape_html(d)}">${d ? frappe.utils.escape_html(d) : __("All Departments")}</option>`;
		}).join("");

		$c.append(`
			<div class="ap-lb-toolbar"
			     style="display:flex; align-items:center; gap:10px;
			            flex-wrap:wrap; margin-bottom:14px;">

				<div style="flex:1; min-width:200px;">
					<input class="ap-lb-search form-control"
					       placeholder="&#128269;  ${__("Filter by employee name or ID…")}"
					       style="max-width:320px; font-size:13px;">
				</div>

				<div style="flex-shrink:0;">
					<select class="ap-lb-dept form-control"
					        style="font-size:12px; width:auto; height:30px; padding:0 6px;">
						${dept_options}
					</select>
				</div>

				<div style="flex-shrink:0;">
					<select class="ap-lb-type form-control"
					        style="font-size:12px; width:auto; height:30px; padding:0 6px;">
						<option value="">${__("All Types")}</option>
						<option value="Contract">${__("Contract")}</option>
						<option value="Contract Basis">${__("Contract Basis")}</option>
					</select>
				</div>

				<div style="flex-shrink:0; margin-left:auto;">
					<span class="ap-lb-count" style="font-size:12px; color:#888;">
						${__("Showing")} ${this.data.length} ${__("of")} ${this.data.length} ${__("employees")}
					</span>
				</div>
			</div>
		`);

		function _apply() {
			var q     = $c.find(".ap-lb-search").val().toLowerCase().trim();
			var dept  = $c.find(".ap-lb-dept").val();
			var etype = $c.find(".ap-lb-type").val();

			me.filtered_data = me.data.filter(function (e) {
				var matchName = !q ||
					(e.employee_name || "").toLowerCase().includes(q) ||
					(e.employee_id  || "").toLowerCase().includes(q);
				var matchDept = !dept  || (e.department     || "") === dept;
				var matchType = !etype || (e.employment_type || "") === etype;
				return matchName && matchDept && matchType;
			});

			me.$tbody && me.$tbody.html(me._build_rows());
			$c.find(".ap-lb-count").text(
				`${__("Showing")} ${me.filtered_data.length} ${__("of")} ${me.data.length} ${__("employees")}`
			);
		}

		$c.find(".ap-lb-search").on("input", _apply);
		$c.find(".ap-lb-dept").on("change", _apply);
		$c.find(".ap-lb-type").on("change", _apply);
	}

	// ─── Results table ──────────────────────────────────────────────────────

	_render_table($c) {
		var TH = function (label) {
			return `<th style="padding:8px 10px; text-align:left;
			                   border:1px solid rgba(0,0,0,.08);
			                   font-size:12px; white-space:nowrap;">${__(label)}</th>`;
		};

		var headers_html = [
			"#", "Employee ID", "Employee Name", "Department", "Employment Type",
			"Casual Leave Allocated", "Casual Leave Taken", "Casual Leave Balance",
			"Casual Leave (Contract) Allocated", "Casual Leave (Contract) Taken",
			"Casual Leave (Contract) Balance", "Total Balance",
		].map(TH).join("");

		var $wrap = $(`
			<div>
				<div style="overflow-x:auto;">
					<table style="width:100%; border-collapse:collapse;
					              font-size:12px; min-width:1000px;">
						<thead>
							<tr style="background:#EFF6FF; color:#1E40AF;">
								${headers_html}
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>
				<div class="ap-lb-footer"
				     style="margin-top:8px; font-size:11px; color:#aaa;">
					${__("Showing")} ${this.filtered_data.length} ${__("of")} ${this.data.length} ${__("employees")}
				</div>
			</div>
		`).appendTo($c);

		this.$tbody = $wrap.find("tbody");
		this.$tbody.html(this._build_rows());
	}

	_build_rows() {
		var TD = function (content, extra) {
			return `<td style="padding:8px 10px; border:1px solid #eee;
			                   font-size:12px; white-space:nowrap;${extra || ""}">${content}</td>`;
		};
		var BALANCE_TD = function (val, bold) {
			var color = val > 0 ? "#166534" : "#DC2626";
			var fw    = bold ? "font-weight:700;" : "";
			return `<td style="padding:8px 10px; border:1px solid #eee;
			                   font-size:12px; white-space:nowrap;
			                   color:${color}; ${fw}">${val}</td>`;
		};

		return this.filtered_data.map(function (emp, i) {
			var bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
			var es = function (s) { return frappe.utils.escape_html(String(s || "")); };
			return `
				<tr style="background:${bg};">
					${TD(i + 1, "color:#888;")}
					${TD(es(emp.employee_id))}
					${TD(es(emp.employee_name), "font-weight:500;")}
					${TD(es(emp.department))}
					${TD(es(emp.employment_type))}
					${TD(emp.casual.allocated)}
					${TD(emp.casual.taken)}
					${BALANCE_TD(emp.casual.balance, false)}
					${TD(emp.casual_contract.allocated)}
					${TD(emp.casual_contract.taken)}
					${BALANCE_TD(emp.casual_contract.balance, false)}
					${BALANCE_TD(emp.total_balance, true)}
				</tr>
			`;
		}).join("");
	}

	// ─── Export ─────────────────────────────────────────────────────────────

	_export() {
		var me        = this;
		var monthName = this.f_month.get_value();
		var year      = this.f_year.get_value();
		var month     = MONTH_NAMES.indexOf(monthName) + 1;

		if (!month || !year) {
			frappe.msgprint({
				title:     __("Missing Fields"),
				message:   __("Please select both Month and Year before exporting."),
				indicator: "orange",
			});
			return;
		}

		frappe.call({
			method:         "attendance_processor.utils.api.export_leave_balance_excel",
			args:           { month: month, year: year },
			freeze:         true,
			freeze_message: __("Generating Excel file…"),
			callback(r) {
				if (r && r.message) {
					me._trigger_download(r.message);
				}
			},
		});
	}

	_trigger_download(result) {
		try {
			var byteArray = Uint8Array.from(
				atob(result.content),
				function (c) { return c.charCodeAt(0); }
			);
			var blob = new Blob([byteArray], { type: result.content_type });
			var url  = URL.createObjectURL(blob);
			var a    = document.createElement("a");
			a.href     = url;
			a.download = result.filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
		} catch (err) {
			console.error("Leave Balance export download error:", err);
			frappe.msgprint({
				title:     __("Download Failed"),
				message:   __("The file could not be downloaded. Please try again."),
				indicator: "red",
			});
		}
	}
}
