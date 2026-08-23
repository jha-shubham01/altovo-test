"""Generator for a fictional multi-page test PDF for the Altovo DocQA RAG app.

Produces: aurora-analytics-release-notes.pdf
Purpose: exercise exact-token keyword retrieval (version numbers, error codes)
and "not in the documents" refusal behavior. Clearly fictional / demo-only.
"""

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    ListFlowable,
    ListItem,
)

OUT = "/Volumes/sj/altovo-test/test-docs/aurora-analytics-release-notes.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="H1", parent=styles["Heading1"], fontSize=18, spaceAfter=6))
styles.add(ParagraphStyle(name="H2", parent=styles["Heading2"], fontSize=13, spaceBefore=10, spaceAfter=4))
styles.add(ParagraphStyle(name="Body2", parent=styles["BodyText"], fontSize=10.5, leading=15, alignment=TA_LEFT, spaceAfter=6))
styles.add(ParagraphStyle(name="Note", parent=styles["BodyText"], fontSize=9, textColor="#888888", spaceAfter=8))


def P(text, style="Body2"):
    return Paragraph(text, styles[style])


def bullets(items):
    return ListFlowable(
        [ListItem(P(t), leftIndent=12) for t in items],
        bulletType="bullet",
        start="circle",
    )


story = []

# ---- Page 1 ----
story.append(P("Aurora Analytics Platform &mdash; Release Notes", "H1"))
story.append(P("v3.2.0, released 12 March 2026", "H2"))
story.append(P("FICTIONAL DOCUMENT &mdash; created for demo and testing purposes only. "
               "Aurora Analytics Platform is not a real product.", "Note"))

story.append(P("Overview", "H2"))
story.append(P(
    "Aurora Analytics Platform v3.2.0 is a feature release focused on faster exploratory "
    "analysis and always-on dashboards. This release supersedes the previous release, "
    "v3.1.4, and is a recommended upgrade for all self-hosted and cloud customers. "
    "Version 3.2.0 was released on 12 March 2026."
))

story.append(P("New Features", "H2"))
story.append(P(
    "This release introduces four named features:"
))
story.append(bullets([
    "<b>Cohort Explorer</b> &mdash; build and compare user cohorts visually without writing SQL.",
    "<b>Live Dashboards</b> &mdash; dashboards that refresh continuously as new events arrive.",
    "<b>Query Profiler</b> &mdash; per-query timing breakdowns to diagnose slow reports.",
    "<b>Scheduled Exports</b> &mdash; deliver CSV snapshots to a destination on a fixed schedule.",
]))
story.append(P(
    "The default query timeout in v3.2.0 is set by the configuration value "
    "<b>QUERY_TIMEOUT = 30s</b>. Queries that exceed 30 seconds are cancelled and return a "
    "timeout error. Administrators can raise this limit per workspace."
))

story.append(PageBreak())

# ---- Page 2 ----
story.append(P("New Features (continued)", "H2"))
story.append(P(
    "Cohort Explorer and Live Dashboards are enabled by default for all workspaces on "
    "v3.2.0. Query Profiler is opt-in and must be turned on per project by a workspace "
    "administrator. Scheduled Exports supports a maximum of 50 scheduled jobs per workspace."
))

story.append(P("Bug Fixes", "H2"))
story.append(P("The following defects were resolved in v3.2.0:"))
story.append(bullets([
    "<b>ERR-4021</b> &mdash; fixed a dashboard export failure that caused large PDF exports "
    "to abort partway through. Dashboard exports now complete reliably regardless of size.",
    "<b>ERR-3350</b> &mdash; fixed a timezone drift bug where scheduled reports ran one hour "
    "off after daylight-saving transitions. Scheduled report times are now stable across DST.",
    "<b>ERR-2907</b> &mdash; fixed a rendering glitch where stacked bar charts dropped the "
    "final series in the legend.",
    "<b>ERR-1188</b> &mdash; fixed an issue where saved filters were not applied on first "
    "dashboard load.",
]))

story.append(PageBreak())

# ---- Page 3 ----
story.append(P("System Requirements", "H2"))
story.append(P(
    "To run Aurora Analytics Platform v3.2.0, the following minimum requirements apply:"
))
story.append(bullets([
    "<b>Minimum RAM: 16 GB</b> for the application server (32 GB recommended for production).",
    "Supported browsers: <b>Google Chrome, Mozilla Firefox, and Microsoft Edge</b>. "
    "<b>Safari is not supported</b> in v3.2.0.",
    "Database: <b>PostgreSQL 14 or later</b> (Postgres 14+). Earlier Postgres versions are "
    "not supported.",
    "Disk: 50 GB free for the event store.",
]))

story.append(P("Deprecations", "H2"))
story.append(P(
    "The <b>legacy v2 REST API is deprecated</b> as of v3.2.0 and will continue to function "
    "throughout the v3.x series. The v2 REST API will be <b>removed in v4.0</b>. Integrations "
    "should migrate to the v3 API before the v4.0 upgrade."
))

story.append(P("Known Issues", "H2"))
story.append(bullets([
    "Live Dashboards may briefly show a stale value for up to 5 seconds immediately after a "
    "workspace is first created; the value corrects itself on the next refresh.",
    "Cohort Explorer comparisons of more than 20 cohorts at once can render slowly on the "
    "application server minimum of 16 GB RAM.",
]))

story.append(PageBreak())

# ---- Page 4 ----
story.append(P("Known Issues (continued)", "H2"))
story.append(P(
    "Both known issues listed above are scheduled for follow-up fixes in a future v3.2.x "
    "patch release. No workaround is required for the Live Dashboards stale-value issue; it "
    "resolves automatically."
))

story.append(P("Upgrade Notes", "H2"))
story.append(P(
    "Upgrading from v3.1.4 to v3.2.0 requires no schema migration and can be performed in "
    "place. Administrators should confirm their database is on PostgreSQL 14+ and that the "
    "application server meets the 16 GB minimum RAM requirement before upgrading."
))

story.append(Spacer(1, 0.3 * inch))
story.append(P("End of release notes for Aurora Analytics Platform v3.2.0 (fictional).", "Note"))


doc = SimpleDocTemplate(
    OUT,
    pagesize=LETTER,
    leftMargin=0.9 * inch,
    rightMargin=0.9 * inch,
    topMargin=0.9 * inch,
    bottomMargin=0.9 * inch,
    title="Aurora Analytics Platform - Release Notes v3.2.0 (fictional)",
)
doc.build(story)
print("wrote", OUT)
