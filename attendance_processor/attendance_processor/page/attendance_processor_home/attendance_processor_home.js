// ─────────────────────────────────────────────────────────────────────────────
// Attendance Processor — Home / Hub page
// Provides a single place with cards linking to every page in the module.
// ─────────────────────────────────────────────────────────────────────────────

frappe.pages["attendance-processor-home"].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Attendance Processor"),
		single_column: true,
	});

	new AttendanceProcessorHome(page);
};

// ─────────────────────────────────────────────────────────────────────────────

class AttendanceProcessorHome {
	constructor(page) {
		this.page = page;
		this._render();
	}

	_render() {
		var isManager    = frappe.user_roles.includes("System Manager");
		var isApprover   = frappe.user_roles.includes("Department Head Attendance Appr");
		var canSeeApprover = isManager || isApprover;

		// Each card definition ─────────────────────────────────────────────
		var cards = [
			{
				route:       "attendance-summary-report",
				icon:        "📋",
				color:       "#2563EB",
				light:       "#EFF6FF",
				border:      "#BFDBFE",
				title:       __("Attendance Summary Report"),
				description: __(
					"Analyse employee attendance records for any date range. " +
					"Preview issues and send personalised email summaries."
				),
			},
		];

		// Approver Summary only for System Manager or Department Head Attendance Appr
		if (canSeeApprover) {
			cards.push({
				route:       "approver-summary",
				icon:        "👔",
				color:       "#7C3AED",
				light:       "#EDE9FE",
				border:      "#DDD6FE",
				title:       __("Approver Summary"),
				description: __(
					"View a consolidated summary of pending attendance items " +
					"grouped by approver, ready for review and approval."
				),
			});
		}

		// Settings card only visible to System Managers ────────────────────
		if (isManager) {
			cards.push({
				route:       "attendance-processor-settings",
				icon:        "⚙️",
				color:       "#059669",
				light:       "#ECFDF5",
				border:      "#A7F3D0",
				title:       __("Attendance Processor Settings"),
				description: __(
					"Enable or disable automated weekly and monthly email reports. " +
					"Configure the send day, send time, and trigger reports on demand."
				),
			});
		}

		// Build cards HTML ─────────────────────────────────────────────────
		var cards_html = cards.map(c => `
			<div class="col-xs-12 col-sm-6 col-md-4" style="padding:10px;">
				<a href="/app/${frappe.utils.escape_html(c.route)}"
				   style="text-decoration:none;display:block;height:100%;">
					<div class="ap-hub-card"
					     style="border:1px solid ${c.border};
					            border-top:4px solid ${c.color};
					            border-radius:8px;
					            background:${c.light};
					            padding:24px 20px;
					            height:100%;
					            box-sizing:border-box;
					            transition:box-shadow 0.2s,transform 0.15s;">
						<div style="font-size:36px;margin-bottom:12px;line-height:1;">
							${c.icon}
						</div>
						<h3 style="margin:0 0 8px 0;
						           font-size:16px;
						           font-weight:700;
						           color:${c.color};
						           font-family:Arial,sans-serif;">
							${c.title}
						</h3>
						<p style="margin:0;
						          font-size:13px;
						          color:#555;
						          line-height:1.55;
						          font-family:Arial,sans-serif;">
							${c.description}
						</p>
						<div style="margin-top:16px;
						            font-size:12px;
						            font-weight:600;
						            color:${c.color};">
							${__("Open")} →
						</div>
					</div>
				</a>
			</div>
		`).join("");

		// Inject into page ─────────────────────────────────────────────────
		$(`
			<div style="padding:24px 16px 60px;">

				<p style="color:#888;font-size:14px;margin-bottom:28px;
				          font-family:Arial,sans-serif;">
					${__("Select a section below to get started.")}
				</p>

				<div class="row" style="margin:0 -10px;">
					${cards_html}
				</div>
			</div>
		`).appendTo($(this.page.main));

		// Hover effect via JS (no extra CSS file needed) ───────────────────
		$(this.page.main).find(".ap-hub-card").on("mouseenter", function () {
			$(this).css({
				"box-shadow": "0 6px 20px rgba(0,0,0,0.10)",
				"transform":  "translateY(-3px)",
			});
		}).on("mouseleave", function () {
			$(this).css({
				"box-shadow": "",
				"transform":  "",
			});
		});
	}
}
